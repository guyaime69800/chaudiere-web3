const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EquipmentRegistryV2", function () {
  let registry;
  let owner;
  let backendWriter;
  let unauthorizedUser;
  let newOwner;

  const equipment = {
    equipmentId: "CP-2026-TEST-001",
    qrCode: "QR-CP-2026-TEST-001",
    brand: "Saunier Duval",
    model: "ThemaPlus Condens 30-A",
    productReference: "0010017388",
    serialNumber: "TEST-SERIAL-001",
  };

  async function registerTestEquipment(contract = registry) {
    return contract.registerEquipment(
      equipment.equipmentId,
      equipment.qrCode,
      equipment.brand,
      equipment.model,
      equipment.productReference,
      equipment.serialNumber
    );
  }

  beforeEach(async function () {
    [owner, backendWriter, unauthorizedUser, newOwner] =
      await ethers.getSigners();

    const EquipmentRegistryV2 = await ethers.getContractFactory(
      "EquipmentRegistryV2"
    );

    registry = await EquipmentRegistryV2.deploy();
    await registry.waitForDeployment();
  });

  it("désigne le compte de déploiement comme propriétaire et rédacteur", async function () {
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.writers(owner.address)).to.equal(true);
    expect(await registry.paused()).to.equal(false);
  });

  it("permet au propriétaire d'autoriser le portefeuille du serveur", async function () {
    await expect(registry.setWriter(backendWriter.address, true))
      .to.emit(registry, "WriterUpdated")
      .withArgs(backendWriter.address, true);

    expect(await registry.writers(backendWriter.address)).to.equal(true);
  });

  it("permet au portefeuille serveur autorisé d'enregistrer un équipement", async function () {
    await registry.setWriter(backendWriter.address, true);

    await expect(
      registry.connect(backendWriter).registerEquipment(
        equipment.equipmentId,
        equipment.qrCode,
        equipment.brand,
        equipment.model,
        equipment.productReference,
        equipment.serialNumber
      )
    )
      .to.emit(registry, "EquipmentRegistered")
      .withArgs(
        equipment.equipmentId,
        equipment.brand,
        equipment.model,
        equipment.productReference,
        equipment.serialNumber
      );

    const savedEquipment = await registry.equipments(
      equipment.equipmentId
    );

    expect(savedEquipment.equipmentId).to.equal(equipment.equipmentId);
    expect(savedEquipment.qrCode).to.equal(equipment.qrCode);
    expect(savedEquipment.brand).to.equal(equipment.brand);
    expect(savedEquipment.model).to.equal(equipment.model);
    expect(savedEquipment.productReference).to.equal(
      equipment.productReference
    );
    expect(savedEquipment.serialNumber).to.equal(
      equipment.serialNumber
    );
    expect(savedEquipment.exists).to.equal(true);
  });

  it("refuse un utilisateur qui n'est pas autorisé", async function () {
    await expect(
      registry.connect(unauthorizedUser).registerEquipment(
        equipment.equipmentId,
        equipment.qrCode,
        equipment.brand,
        equipment.model,
        equipment.productReference,
        equipment.serialNumber
      )
    ).to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("refuse les doublons d'identifiant et de numéro de série", async function () {
    await registerTestEquipment();

    await expect(
      registerTestEquipment()
    ).to.be.revertedWithCustomError(
      registry,
      "EquipmentAlreadyExists"
    );

    await expect(
      registry.registerEquipment(
        "CP-2026-TEST-002",
        "QR-CP-2026-TEST-002",
        "Saunier Duval",
        "ThemaPlus Condens 25-A",
        "0010017417",
        equipment.serialNumber
      )
    ).to.be.revertedWithCustomError(
      registry,
      "SerialNumberAlreadyExists"
    );
  });

  it("ajoute et restitue une intervention de maintenance", async function () {
    await registerTestEquipment();

    await expect(
      registry.addMaintenance(
        equipment.equipmentId,
        "Entretien annuel",
        "Nettoyage et contrôle de combustion",
        "Technicien CarnetPass",
        "Joint brûleur"
      )
    )
      .to.emit(registry, "MaintenanceAdded")
      .withArgs(
        equipment.equipmentId,
        "Entretien annuel",
        "Technicien CarnetPass"
      );

    const maintenanceList = await registry.getMaintenances(
      equipment.equipmentId
    );

    expect(maintenanceList.length).to.equal(1);
    expect(maintenanceList[0].interventionType).to.equal(
      "Entretien annuel"
    );
    expect(maintenanceList[0].description).to.equal(
      "Nettoyage et contrôle de combustion"
    );
    expect(maintenanceList[0].technician).to.equal(
      "Technicien CarnetPass"
    );
    expect(maintenanceList[0].partChanged).to.equal(
      "Joint brûleur"
    );
    expect(maintenanceList[0].date).to.be.greaterThan(0);
  });

  it("refuse une maintenance pour un équipement inexistant", async function () {
    await expect(
      registry.addMaintenance(
        "CP-INCONNU",
        "Entretien annuel",
        "Contrôle",
        "Technicien CarnetPass",
        ""
      )
    ).to.be.revertedWithCustomError(
      registry,
      "EquipmentNotFound"
    );
  });

  it("bloque les écritures lorsque le contrat est en pause", async function () {
    await registry.setPaused(true);

    await expect(
      registerTestEquipment()
    ).to.be.revertedWithCustomError(
      registry,
      "ContractPaused"
    );

    await registry.setPaused(false);
    await expect(registerTestEquipment()).not.to.be.reverted;
  });

  it("permet de retirer l'autorisation du portefeuille serveur", async function () {
    await registry.setWriter(backendWriter.address, true);
    await registry.setWriter(backendWriter.address, false);

    expect(await registry.writers(backendWriter.address)).to.equal(
      false
    );

    await expect(
      registry.connect(backendWriter).registerEquipment(
        equipment.equipmentId,
        equipment.qrCode,
        equipment.brand,
        equipment.model,
        equipment.productReference,
        equipment.serialNumber
      )
    ).to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("transfère correctement la propriété du contrat", async function () {
    await expect(registry.transferOwnership(newOwner.address))
      .to.emit(registry, "OwnershipTransferred")
      .withArgs(owner.address, newOwner.address);

    expect(await registry.owner()).to.equal(newOwner.address);
    expect(await registry.writers(owner.address)).to.equal(false);
    expect(await registry.writers(newOwner.address)).to.equal(true);

    await expect(
      registry.setPaused(true)
    ).to.be.revertedWithCustomError(registry, "Unauthorized");

    await registry.connect(newOwner).setPaused(true);
    expect(await registry.paused()).to.equal(true);
  });
});