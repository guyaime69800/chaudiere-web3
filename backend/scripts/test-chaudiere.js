// On importe Hardhat, qui nous donne accès à "ethers" pour parler au contrat
const hre = require("hardhat");

// "main" = la fonction principale qui contient toutes nos étapes de test
async function main() {

    console.log("--- DEBUT DU TEST ---\n");

    // ÉTAPE 1 : on déploie le contrat sur la mini-blockchain locale
    // getContractFactory = on récupère le "moule" de notre contrat BoilerRegistry
    const BoilerRegistry = await hre.ethers.getContractFactory("BoilerRegistry");
    // deploy() = on crée concrètement le contrat sur la blockchain
    const registry = await BoilerRegistry.deploy();
    // on attend que le déploiement soit bien terminé
    await registry.waitForDeployment();
    console.log("✅ Contrat deploye a l'adresse :", await registry.getAddress(), "\n");

    // ÉTAPE 2 : on enregistre une chaudière fictive
    // On appelle la fonction registerBoiler de ton contrat
    const tx1 = await registry.registerBoiler(
        "CHAUD-001",                 // _boilerId
        "QR-CODE-XYZ-123",           // _qrCode
        "Jean Dupont",               // _owner (proprietaire)
        "12 rue des Lilas, Lyon"     // _location (emplacement)
    );
    await tx1.wait(); // on attend que la transaction soit validee
    console.log("✅ Chaudiere CHAUD-001 enregistree !\n");

    // ÉTAPE 3 : on ajoute une intervention au carnet d'entretien
    const tx2 = await registry.addMaintenance(
        "CHAUD-001",                       // _boilerId
        "Entretien annuel",                // _interventionType (le type)
        "Nettoyage et controle du brûleur",// _description
        "Tech-Marc",                       // _technician
        "Aucune"                           // _partChanged (piece changee)
    );
    await tx2.wait();
    console.log("✅ Maintenance ajoutee au carnet !\n");

    // ÉTAPE 4 : on RELIT la chaudière pour verifier qu'elle est bien enregistree
    const chaudiere = await registry.boilers("CHAUD-001");
    console.log("--- FICHE DE LA CHAUDIERE ---");
    console.log("Identifiant :", chaudiere.boilerId);
    console.log("QR Code     :", chaudiere.qrCode);
    console.log("Proprietaire:", chaudiere.owner);
    console.log("Emplacement :", chaudiere.location);
    console.log("Existe      :", chaudiere.exists, "\n");

    // ÉTAPE 5 : on relit la PREMIERE maintenance du carnet (la case numero 0)
    // (la liste commence a 0 : la 1ere intervention est donc a l'index 0)
    const maintenance = await registry.maintenances("CHAUD-001", 0);
    console.log("--- PREMIERE INTERVENTION DU CARNET ---");
    console.log("Date (en secondes) :", maintenance.date.toString());
    console.log("Type        :", maintenance.interventionType);
    console.log("Description :", maintenance.description);
    console.log("Technicien  :", maintenance.technician);
    console.log("Piece       :", maintenance.partChanged, "\n");
    // ÉTAPE 6 : on TESTE LE GARDE-FOU
    // On tente d'ajouter une maintenance a une chaudiere qui N'EXISTE PAS (CHAUD-999).
    // Normalement, le require doit BLOQUER et renvoyer une erreur.
    console.log("--- TEST DU GARDE-FOU (chaudiere inexistante) ---");
    try {
        // On essaie l'action interdite...
        const tx3 = await registry.addMaintenance(
            "CHAUD-999",          // cette chaudiere n'a jamais ete enregistree !
            "Entretien annuel",
            "Test interdit",
            "Tech-Marc",
            "Aucune"
        );
        await tx3.wait();
        // Si on arrive ici, c'est que le garde-fou n'a PAS fonctionne (mauvais signe)
        console.log("❌ PROBLEME : l'ajout a ete accepte alors qu'il aurait du etre bloque !\n");
    } catch (error) {
        // Si on arrive ICI, c'est que le require a bien bloque (bon signe !)
        console.log("✅ PARFAIT : le contrat a bien REFUSE l'ajout.");
        console.log("   Raison renvoyee par le contrat :", error.message.includes("Cette chaudiere n'existe pas") ? "Cette chaudiere n'existe pas" : "(bloque)", "\n");
    }
    console.log("--- FIN DU TEST : TOUT FONCTIONNE ! 🎉 ---");
}

// On lance la fonction main, et on attrape les erreurs eventuelles pour les afficher
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});