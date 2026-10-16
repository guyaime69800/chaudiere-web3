const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EquipmentRegistryV2", function () {
  let registry;
  let owner;
  let backendWriter;
  let unauthorizedUser;
  let newOwner;

  const equipmentKey = ethers.keccak256(
    ethers.toUtf8Bytes("equipment:CP-2026-TEST-001")
  );

  const equipmentDataHash = ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify({
        brand: "Saunier Duval",
        model: "ThemaPlus Condens 30-A",
        productReference: "0010017388",
      })
    )
  );

  const serialHash = ethers.keccak256(
    ethers.toUtf8Bytes(
      "company:test-company-id|serial:TEST-SERIAL-001"
    )
  );

  const maintenanceProofId = ethers.keccak256(
    ethers.toUtf8Bytes("maintenance:TEST-MAINTENANCE-001")
  );

  const maintenanceDataHash = ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify({
        interventionType: "Entretien annuel",
        description: "Nettoyage et contrôle de combustion",
        technician: "Technicien CarnetPass",
        partChanged: "Joint brûleur",
      })
    )
  );

  async function registerTestEquipment(contract = registry) {
    return contract.registerEquipment(
      equipmentKey,
      equipmentDataHash,
      serialHash
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
    expect(await registry.pendingOwner()).to.equal(ethers.ZeroAddress);
  });

  it("permet au propriétaire d'autoriser le portefeuille serveur", async function () {
    await expect(registry.setWriter(backendWriter.address, true))
      .to.emit(registry, "WriterUpdated")
      .withArgs(backendWriter.address, true);

    expect(await registry.writers(backendWriter.address)).to.equal(true);
  });

  it("permet au portefeuille serveur d'enregistrer une preuve d'équipement", async function () {
    await registry.setWriter(backendWriter.address, true);

    await expect(
      registry
        .connect(backendWriter)
        .registerEquipment(
          equipmentKey,
          equipmentDataHash,
          serialHash
        )
    ).to.emit(registry, "EquipmentRegistered");

    const savedProof = await registry.equipments(equipmentKey);

    expect(savedProof.dataHash).to.equal(equipmentDataHash);
    expect(savedProof.serialHash).to.equal(serialHash);
    expect(savedProof.registeredAt).to.be.greaterThan(0);
    expect(savedProof.exists).to.equal(true);
  });

  it("refuse l'enregistrement par un utilisateur non autorisé", async function () {
    await expect(
      registry
        .connect(unauthorizedUser)
        .registerEquipment(
          equipmentKey,
          equipmentDataHash,
          serialHash
        )
    ).to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("refuse les empreintes cryptographiques vides", async function () {
    await expect(
      registry.registerEquipment(
        ethers.ZeroHash,
        equipmentDataHash,
        serialHash
      )
    ).to.be.revertedWithCustomError(registry, "InvalidHash");

    await expect(
      registry.registerEquipment(
        equipmentKey,
        ethers.ZeroHash,
        serialHash
      )
    ).to.be.revertedWithCustomError(registry, "InvalidHash");

    await expect(
      registry.registerEquipment(
        equipmentKey,
        equipmentDataHash,
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(registry, "InvalidHash");
  });

  it("refuse un identifiant d'équipement déjà enregistré", async function () {
    await registerTestEquipment();

    const differentSerialHash = ethers.keccak256(
      ethers.toUtf8Bytes(
        "company:test-company-id|serial:TEST-SERIAL-002"
      )
    );

    await expect(
      registry.registerEquipment(
        equipmentKey,
        equipmentDataHash,
        differentSerialHash
      )
    ).to.be.revertedWithCustomError(
      registry,
      "EquipmentAlreadyExists"
    );
  });

  it("refuse un numéro de série déjà enregistré", async function () {
    await registerTestEquipment();

    const differentEquipmentKey = ethers.keccak256(
      ethers.toUtf8Bytes("equipment:CP-2026-TEST-002")
    );

    await expect(
      registry.registerEquipment(
        differentEquipmentKey,
        equipmentDataHash,
        serialHash
      )
    ).to.be.revertedWithCustomError(
      registry,
      "SerialNumberAlreadyExists"
    );
  });

  it("ajoute et restitue une preuve de maintenance", async function () {
    await registerTestEquipment();

    await expect(
      registry.addMaintenance(
        equipmentKey,
        maintenanceProofId,
        maintenanceDataHash
      )
    ).to.emit(registry, "MaintenanceAdded");

    const maintenanceList = await registry.getMaintenances(
      equipmentKey
    );

    expect(maintenanceList.length).to.equal(1);
    expect(maintenanceList[0].proofId).to.equal(
      maintenanceProofId
    );
    expect(maintenanceList[0].dataHash).to.equal(
      maintenanceDataHash
    );
    expect(maintenanceList[0].recordedAt).to.be.greaterThan(0);

    expect(
      await registry.getMaintenanceCount(equipmentKey)
    ).to.equal(1);
  });

  it("refuse une maintenance pour un équipement inexistant", async function () {
    const unknownEquipmentKey = ethers.keccak256(
      ethers.toUtf8Bytes("equipment:UNKNOWN")
    );

    await expect(
      registry.addMaintenance(
        unknownEquipmentKey,
        maintenanceProofId,
        maintenanceDataHash
      )
    ).to.be.revertedWithCustomError(
      registry,
      "EquipmentNotFound"
    );
  });

  it("refuse une preuve de maintenance enregistrée deux fois", async function () {
    await registerTestEquipment();

    await registry.addMaintenance(
      equipmentKey,
      maintenanceProofId,
      maintenanceDataHash
    );

    await expect(
      registry.addMaintenance(
        equipmentKey,
        maintenanceProofId,
        maintenanceDataHash
      )
    ).to.be.revertedWithCustomError(
      registry,
      "MaintenanceProofAlreadyExists"
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
      registry
        .connect(backendWriter)
        .registerEquipment(
          equipmentKey,
          equipmentDataHash,
          serialHash
        )
    ).to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("empêche de retirer les droits d'urgence du propriétaire", async function () {
    await expect(
      registry.setWriter(owner.address, false)
    ).to.be.revertedWithCustomError(registry, "Unauthorized");

    expect(await registry.writers(owner.address)).to.equal(true);
  });

  it("effectue un transfert de propriété sécurisé en deux étapes", async function () {
    await expect(registry.transferOwnership(newOwner.address))
      .to.emit(registry, "OwnershipTransferStarted")
      .withArgs(owner.address, newOwner.address);

    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.pendingOwner()).to.equal(
      newOwner.address
    );

    await expect(
      registry.connect(unauthorizedUser).acceptOwnership()
    ).to.be.revertedWithCustomError(registry, "Unauthorized");

    await expect(
      registry.connect(newOwner).acceptOwnership()
    )
      .to.emit(registry, "OwnershipTransferred")
      .withArgs(owner.address, newOwner.address);

    expect(await registry.owner()).to.equal(newOwner.address);
    expect(await registry.pendingOwner()).to.equal(
      ethers.ZeroAddress
    );
    expect(await registry.writers(owner.address)).to.equal(false);
    expect(await registry.writers(newOwner.address)).to.equal(true);
  });
});