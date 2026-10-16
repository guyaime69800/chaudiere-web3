const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EquipmentRegistry", function () {
    let registry;
    let admin;
    let autrePersonne;

    beforeEach(async function () {
        [admin, autrePersonne] = await ethers.getSigners();

        const EquipmentRegistry =
            await ethers.getContractFactory("EquipmentRegistry");

        registry = await EquipmentRegistry.deploy();
        await registry.waitForDeployment();
    });

    it("devrait enregistrer un equipement", async function () {
        await registry.registerEquipment(
            "EQUIP-001",
            "QR-001",
            "Saunier Duval",
            "ThemaPlus Condens 30-A",
            "0010017388",
            "SERIE-123456"
        );

        const equipment = await registry.equipments("EQUIP-001");

        expect(equipment.equipmentId).to.equal("EQUIP-001");
        expect(equipment.qrCode).to.equal("QR-001");
        expect(equipment.brand).to.equal("Saunier Duval");
        expect(equipment.model).to.equal("ThemaPlus Condens 30-A");
        expect(equipment.productReference).to.equal("0010017388");
        expect(equipment.serialNumber).to.equal("SERIE-123456");
        expect(equipment.exists).to.equal(true);
    });

    it("devrait refuser un equipement deja enregistre", async function () {
        await registry.registerEquipment(
            "EQUIP-001",
            "QR-001",
            "Saunier Duval",
            "ThemaPlus Condens 30-A",
            "0010017388",
            "SERIE-123456"
        );

        await expect(
            registry.registerEquipment(
                "EQUIP-001",
                "QR-002",
                "Saunier Duval",
                "Autre modele",
                "REF-002",
                "SERIE-654321"
            )
        ).to.be.revertedWith("Cet equipement existe deja");
    });

    it("devrait ajouter une maintenance", async function () {
        await registry.registerEquipment(
            "EQUIP-001",
            "QR-001",
            "Saunier Duval",
            "ThemaPlus Condens 30-A",
            "0010017388",
            "SERIE-123456"
        );

        await registry.addMaintenance(
            "EQUIP-001",
            "Entretien annuel",
            "Nettoyage du bruleur",
            "Technicien test",
            "Aucune"
        );

        const maintenances =
            await registry.getMaintenances("EQUIP-001");

        expect(maintenances.length).to.equal(1);
        expect(maintenances[0].interventionType)
            .to.equal("Entretien annuel");
        expect(maintenances[0].technician)
            .to.equal("Technicien test");
    });

    it("devrait refuser une maintenance sur un equipement inexistant", async function () {
        await expect(
            registry.addMaintenance(
                "EQUIP-999",
                "Entretien",
                "Test",
                "Technicien test",
                "Aucune"
            )
        ).to.be.revertedWith("Cet equipement n'existe pas");
    });

    it("devrait refuser l'enregistrement par un non-admin", async function () {
        await expect(
            registry.connect(autrePersonne).registerEquipment(
                "EQUIP-002",
                "QR-002",
                "Marque test",
                "Modele test",
                "REF-002",
                "SERIE-002"
            )
        ).to.be.revertedWith("Reserve a l'administrateur");
    });

    it("devrait refuser une maintenance par un non-admin", async function () {
        await registry.registerEquipment(
            "EQUIP-001",
            "QR-001",
            "Saunier Duval",
            "ThemaPlus Condens 30-A",
            "0010017388",
            "SERIE-123456"
        );

        await expect(
            registry.connect(autrePersonne).addMaintenance(
                "EQUIP-001",
                "Fausse intervention",
                "Tentative non autorisee",
                "Inconnu",
                "Aucune"
            )
        ).to.be.revertedWith("Reserve a l'administrateur");
    });
    it("devrait refuser un numero de serie deja utilise", async function () {
        await registry.registerEquipment(
            "EQUIP-001",
            "QR-001",
            "Saunier Duval",
            "ThemaPlus Condens 30-A",
            "0010017388",
            "SERIE-123456"
        );

        await expect(
            registry.registerEquipment(
                "EQUIP-002",
                "QR-002",
                "Saunier Duval",
                "ThemaPlus Condens 30-A",
                "0010017388",
                "SERIE-123456"
            )
        ).to.be.revertedWith("Ce numero de serie existe deja");
    });
    });