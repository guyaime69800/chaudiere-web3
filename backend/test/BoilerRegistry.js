// On importe les outils : "expect" (les verifications) et "ethers" (pour parler au contrat)
const { expect } = require("chai");
const { ethers } = require("hardhat");

// describe = un "chapitre" de tests. Ici : tous les tests du contrat BoilerRegistry.
describe("BoilerRegistry", function () {

  // Une variable pour garder notre contrat deploye, accessible dans tous les tests
  let registry;

  // "beforeEach" s'execute AVANT CHAQUE test : on redeploie un contrat tout neuf.
  // Comme ca, chaque test part d'une situation propre (independant des autres).
  beforeEach(async function () {
    const BoilerRegistry = await ethers.getContractFactory("BoilerRegistry");
    registry = await BoilerRegistry.deploy();
    await registry.waitForDeployment();
  });

  // it = un test precis. Celui-ci verifie qu'on peut enregistrer une chaudiere.
  it("devrait enregistrer une chaudiere", async function () {
    // On enregistre une chaudiere
    await registry.registerBoiler("CHAUD-001", "QR-123", "Jean Dupont", "Lyon");

    // On relit la chaudiere depuis le contrat
    const chaudiere = await registry.boilers("CHAUD-001");

    // VERIFICATIONS : on s'attend a retrouver exactement ce qu'on a enregistre
    expect(chaudiere.owner).to.equal("Jean Dupont");   // le proprietaire doit etre Jean Dupont
    expect(chaudiere.location).to.equal("Lyon");        // l'emplacement doit etre Lyon
    expect(chaudiere.exists).to.equal(true);            // le drapeau exists doit etre true
  });
// TEST 2 : ajouter une maintenance au carnet d'une chaudiere existante
  it("devrait ajouter une maintenance au carnet", async function () {
    // D'abord on enregistre une chaudiere (sinon le require bloquerait)
    await registry.registerBoiler("CHAUD-001", "QR-123", "Jean Dupont", "Lyon");

    // On ajoute une intervention
    await registry.addMaintenance("CHAUD-001", "Entretien annuel", "Nettoyage bruleur", "Tech-Marc", "Aucune");

    // On relit la 1ere intervention du carnet (case numero 0)
    const maintenance = await registry.maintenances("CHAUD-001", 0);

    // VERIFICATIONS : on retrouve bien ce qu'on a saisi
    expect(maintenance.interventionType).to.equal("Entretien annuel");
    expect(maintenance.technician).to.equal("Tech-Marc");
  });

  // TEST 3 : le garde-fou "require" doit BLOQUER une maintenance sur une chaudiere inexistante
  it("devrait REFUSER une maintenance si la chaudiere n'existe pas", async function () {
    // On tente d'ajouter une maintenance a CHAUD-999 (jamais enregistree)
    // On s'attend a ce que ce soit REJETE (reverted) avec le bon message
    await expect(
      registry.addMaintenance("CHAUD-999", "Entretien", "Test", "Tech", "Aucune")
    ).to.be.revertedWith("Cette chaudiere n'existe pas");
  });

  // TEST 4 : le garde-fou "onlyOwner" doit BLOQUER un non-admin qui veut enregistrer
  it("devrait REFUSER l'enregistrement par un non-admin", async function () {
    // getSigners() = la liste des comptes de test. [0] = admin, [1] = quelqu'un d'autre.
    const [admin, autrePersonne] = await ethers.getSigners();

    // L'autre personne tente d'enregistrer une chaudiere -> doit etre REJETE
    await expect(
      registry.connect(autrePersonne).registerBoiler("CHAUD-002", "QR", "Pirate", "Nulle part")
    ).to.be.revertedWith("Reserve a l'administrateur");
  });
});