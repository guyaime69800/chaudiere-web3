// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BoilerRegistry {
    struct Boiler {
        string boilerId;
        string qrCode;
        string owner;
        string location;
        bool exists;
    }

    struct Maintenance {
        uint256 date;
        string interventionType;
        string description;
        string technician;
        string partChanged;
    }

    mapping(string => Boiler) public boilers;
    mapping(string => Maintenance[]) public maintenances;
    // L'adresse du proprietaire (admin) du contrat.
    // address = identifiant unique d'un compte/wallet sur la blockchain.
    address public owner;

    // Le constructor s'execute UNE SEULE FOIS, au deploiement du contrat.
    // msg.sender = celui qui appelle (ici, celui qui deploie) -> il devient l'admin.
    constructor() {
        owner = msg.sender;
    }

    // "modifier" = une regle reutilisable a accrocher sur une fonction.
    // onlyOwner verifie que l'appelant est bien l'admin, sinon il bloque tout.
    // Le "_;" = "ici s'execute le reste de la fonction" (uniquement si le require passe).
    modifier onlyOwner() {
        require(msg.sender == owner, "Reserve a l'administrateur");
        _;
    }
    function registerBoiler(
        string memory _boilerId,
        string memory _qrCode,
        string memory _owner,
        string memory _location
    ) public onlyOwner {
        boilers[_boilerId] = Boiler(
            _boilerId,
            _qrCode,
            _owner,
            _location,
            true
        );
    }

    function addMaintenance(
        string memory _boilerId,
        string memory _interventionType,
        string memory _description,
        string memory _technician,
        string memory _partChanged
    ) public {
        // On vérifie que la chaudière existe AVANT d'ajouter une maintenance.
        // Si elle n'existe pas (exists == false), on bloque et on renvoie un message d'erreur.
        require(boilers[_boilerId].exists, "Cette chaudiere n'existe pas");
        maintenances[_boilerId].push(
            Maintenance(
                block.timestamp,
                _interventionType,
                _description,
                _technician,
                _partChanged
            )
        );
    }
}
