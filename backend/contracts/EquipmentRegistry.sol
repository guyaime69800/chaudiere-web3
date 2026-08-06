// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EquipmentRegistry {
    // ───────────── MODELES DE FICHES (structs) ─────────────

    // Carte d'identite technique d'un equipement.
    struct Equipment {
        string equipmentId;
        string qrCode;
        string brand;
        string model;
        string productReference;
        string serialNumber;
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

    // Annuaire des equipements : un identifiant -> une fiche Boiler.
    mapping(string => Equipment) public equipments;

    // Carnet d'entretien : un identifiant -> une LISTE de maintenances.
    mapping(string => Maintenance[]) public maintenances;

    // ───────────── EVENEMENTS (events) ─────────────
    // Des "annonces" que le contrat diffuse quand une action a lieu.
    // "indexed" rend un champ filtrable/recherchable (pratique pour l'interface).

    // Annonce : une nouvelle equipement a ete enregistree.
    event EquipmentRegistered(
        string indexed equipmentId,
        string brand,
        string model,
        string productReference,
        string serialNumber
    );

    // Annonce : une maintenance a ete ajoutee a un equipement.
    event MaintenanceAdded(
        string indexed equipmentId,
        string interventionType,
        string technician
    );

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
    // Enregistrer un nouvel equipement. Reserve a l'admin.
    function registerEquipment(
        string memory _equipmentId,
        string memory _qrCode,
        string memory _brand,
        string memory _model,
        string memory _productReference,
        string memory _serialNumber
    ) public onlyOwner {
        require(bytes(_equipmentId).length > 0, "Identifiant obligatoire");

        require(bytes(_serialNumber).length > 0, "Numero de serie obligatoire");

        require(!equipments[_equipmentId].exists, "Cet equipement existe deja");

        equipments[_equipmentId] = Equipment(
            _equipmentId,
            _qrCode,
            _brand,
            _model,
            _productReference,
            _serialNumber,
            true
        );

        emit EquipmentRegistered(
            _equipmentId,
            _brand,
            _model,
            _productReference,
            _serialNumber
        );
    }

    // Ajouter une intervention au carnet d'un equipement.
    // Temporairement reserve a l'administrateur CarnetPass.
    function addMaintenance(
        string memory _equipmentId,
        string memory _interventionType,
        string memory _description,
        string memory _technician,
        string memory _partChanged
    ) public onlyOwner {
        require(equipments[_equipmentId].exists, "Cet equipement n'existe pas");

        maintenances[_equipmentId].push(
            Maintenance(
                block.timestamp,
                _interventionType,
                _description,
                _technician,
                _partChanged
            )
        );

        emit MaintenanceAdded(_equipmentId, _interventionType, _technician);
    }
    // ----------- LECTURE DU CARNET (view) -----------
    // Renvoie TOUTES les interventions d'une chaudiere en une seule fois.
    // Renvoie toutes les interventions d'un equipement.
    function getMaintenances(
        string memory _equipmentId
    ) public view returns (Maintenance[] memory) {
        return maintenances[_equipmentId];
    }
}
