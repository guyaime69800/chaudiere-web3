// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BoilerRegistry {

    // ───────────── MODELES DE FICHES (structs) ─────────────

    // Carte d'identite d'une chaudiere.
    struct Boiler {
        string boilerId;
        string qrCode;
        string owner;
        string location;
        bool exists;
    }

    // Une page du carnet d'entretien (une intervention).
    struct Maintenance {
        uint256 date;
        string interventionType;
        string description;
        string technician;
        string partChanged;
    }

    // ───────────── RANGEMENTS (mappings) ─────────────

    // Annuaire des chaudieres : un identifiant -> une fiche Boiler.
    mapping(string => Boiler) public boilers;

    // Carnet d'entretien : un identifiant -> une LISTE de maintenances.
    mapping(string => Maintenance[]) public maintenances;

    // ───────────── EVENEMENTS (events) ─────────────
    // Des "annonces" que le contrat diffuse quand une action a lieu.
    // "indexed" rend un champ filtrable/recherchable (pratique pour l'interface).

    // Annonce : une nouvelle chaudiere a ete enregistree.
    event BoilerRegistered(string indexed boilerId, string owner, string location);

    // Annonce : une maintenance a ete ajoutee a une chaudiere.
    event MaintenanceAdded(string indexed boilerId, string interventionType, string technician);

    // ───────────── ADMIN (controle d'acces) ─────────────

    // L'adresse du proprietaire (admin) du contrat.
    address public owner;

    // Le constructor s'execute UNE SEULE FOIS, au deploiement -> celui qui deploie devient l'admin.
    constructor() {
        owner = msg.sender;
    }

    // modifier = regle reutilisable accrochee a une fonction.
    // onlyOwner verifie que l'appelant est bien l'admin, sinon il bloque tout.
    modifier onlyOwner() {
        require(msg.sender == owner, "Reserve a l'administrateur");
        _;
    }

    // ───────────── ACTIONS (functions) ─────────────

    // Enregistrer une nouvelle chaudiere. Reserve a l'admin (onlyOwner).
    function registerBoiler(
        string memory _boilerId,
        string memory _qrCode,
        string memory _owner,
        string memory _location
    ) public onlyOwner {

        // On cree la fiche et on la range dans l'annuaire.
        boilers[_boilerId] = Boiler(
            _boilerId,
            _qrCode,
            _owner,
            _location,
            true
        );

        // On diffuse l'annonce : chaudiere enregistree.
        emit BoilerRegistered(_boilerId, _owner, _location);
    }

    // Ajouter une intervention au carnet d'entretien. Ouvert a tous (Option A).
    function addMaintenance(
        string memory _boilerId,
        string memory _interventionType,
        string memory _description,
        string memory _technician,
        string memory _partChanged
    ) public {

        // On verifie que la chaudiere existe AVANT d'ajouter une maintenance.
        require(boilers[_boilerId].exists, "Cette chaudiere n'existe pas");

        // On ajoute une nouvelle "page" au carnet (.push = ajouter a la liste).
        maintenances[_boilerId].push(
            Maintenance(
                block.timestamp,  // la blockchain inscrit la date automatiquement
                _interventionType,
                _description,
                _technician,
                _partChanged
            )
        );

        // On diffuse l'annonce : maintenance ajoutee.
        emit MaintenanceAdded(_boilerId, _interventionType, _technician);
    }
// ----------- LECTURE DU CARNET (view) -----------
    // Renvoie TOUTES les interventions d'une chaudiere en une seule fois.
    // "view" = lecture pure : gratuit a appeler depuis le frontend (aucun gas).
    function getMaintenances(string memory _boilerId)
        public
        view
        returns (Maintenance[] memory)
    {
        return maintenances[_boilerId];
    }
}