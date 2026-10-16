// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EquipmentRegistryV2 {
    // Preuve de création d'un équipement.
    // Aucune donnée métier lisible n'est enregistrée publiquement.
    struct EquipmentProof {
        bytes32 dataHash;
        bytes32 serialHash;
        uint256 registeredAt;
        bool exists;
    }

    // Preuve d'une intervention de maintenance.
    struct MaintenanceProof {
        bytes32 proofId;
        bytes32 dataHash;
        uint256 recordedAt;
    }

    address public owner;
    address public pendingOwner;
    bool public paused;

    // Portefeuilles techniques autorisés à écrire.
    mapping(address => bool) public writers;

    // Empreinte de l'identifiant interne vers la preuve de l'équipement.
    mapping(bytes32 => EquipmentProof) public equipments;

    // Empêche l'enregistrement multiple d'un même numéro de série.
    mapping(bytes32 => bool) public registeredSerialHashes;

    // Empêche qu'une intervention soit inscrite deux fois.
    mapping(bytes32 => bool) public registeredMaintenanceProofs;

    // Historique des preuves de maintenance par équipement.
    mapping(bytes32 => MaintenanceProof[]) private maintenances;

    event OwnershipTransferStarted(
        address indexed currentOwner,
        address indexed pendingOwner
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event WriterUpdated(
        address indexed writer,
        bool authorized
    );

    event PauseUpdated(bool paused);

    event EquipmentRegistered(
        bytes32 indexed equipmentKey,
        bytes32 indexed dataHash,
        bytes32 indexed serialHash,
        uint256 registeredAt
    );

    event MaintenanceAdded(
        bytes32 indexed equipmentKey,
        bytes32 indexed proofId,
        bytes32 indexed dataHash,
        uint256 recordedAt
    );

    error Unauthorized();
    error ContractPaused();
    error InvalidAddress();
    error InvalidHash();
    error EquipmentAlreadyExists();
    error SerialNumberAlreadyExists();
    error EquipmentNotFound();
    error MaintenanceProofAlreadyExists();

    constructor() {
        owner = msg.sender;
        writers[msg.sender] = true;

        emit WriterUpdated(msg.sender, true);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyWriter() {
        if (paused) {
            revert ContractPaused();
        }

        if (!writers[msg.sender]) {
            revert Unauthorized();
        }
        _;
    }

    function setWriter(
        address writer,
        bool authorized
    ) external onlyOwner {
        if (writer == address(0)) {
            revert InvalidAddress();
        }

        // Le propriétaire doit toujours conserver un accès d'urgence.
        if (writer == owner && !authorized) {
            revert Unauthorized();
        }

        writers[writer] = authorized;

        emit WriterUpdated(writer, authorized);
    }

    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;

        emit PauseUpdated(newPaused);
    }

    // Première étape du transfert de propriété.
    // Le nouveau propriétaire devra ensuite accepter.
    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        if (newOwner == address(0) || newOwner == owner) {
            revert InvalidAddress();
        }

        pendingOwner = newOwner;

        emit OwnershipTransferStarted(owner, newOwner);
    }

    // Deuxième étape : évite de perdre le contrat à cause
    // d'une mauvaise adresse saisie.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) {
            revert Unauthorized();
        }

        address previousOwner = owner;
        address newOwner = pendingOwner;

        owner = newOwner;
        pendingOwner = address(0);

        writers[previousOwner] = false;
        writers[newOwner] = true;

        emit WriterUpdated(previousOwner, false);
        emit WriterUpdated(newOwner, true);
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    // Enregistre seulement les empreintes cryptographiques.
    //
    // equipmentKey :
    // empreinte de l'identifiant interne Supabase.
    //
    // dataHash :
    // empreinte des données complètes de l'équipement.
    //
    // serialHash :
    // empreinte du numéro de série avec le périmètre entreprise.
    function registerEquipment(
        bytes32 equipmentKey,
        bytes32 dataHash,
        bytes32 serialHash
    ) external onlyWriter {
        if (
            equipmentKey == bytes32(0) ||
            dataHash == bytes32(0) ||
            serialHash == bytes32(0)
        ) {
            revert InvalidHash();
        }

        if (equipments[equipmentKey].exists) {
            revert EquipmentAlreadyExists();
        }

        if (registeredSerialHashes[serialHash]) {
            revert SerialNumberAlreadyExists();
        }

        uint256 registrationDate = block.timestamp;

        equipments[equipmentKey] = EquipmentProof({
            dataHash: dataHash,
            serialHash: serialHash,
            registeredAt: registrationDate,
            exists: true
        });

        registeredSerialHashes[serialHash] = true;

        emit EquipmentRegistered(
            equipmentKey,
            dataHash,
            serialHash,
            registrationDate
        );
    }

    // Enregistre uniquement la preuve d'une intervention.
    //
    // proofId :
    // identifiant unique de l'intervention transformé en empreinte.
    //
    // dataHash :
    // empreinte du contenu complet de l'intervention.
    function addMaintenance(
        bytes32 equipmentKey,
        bytes32 proofId,
        bytes32 dataHash
    ) external onlyWriter {
        if (
            equipmentKey == bytes32(0) ||
            proofId == bytes32(0) ||
            dataHash == bytes32(0)
        ) {
            revert InvalidHash();
        }

        if (!equipments[equipmentKey].exists) {
            revert EquipmentNotFound();
        }

        if (registeredMaintenanceProofs[proofId]) {
            revert MaintenanceProofAlreadyExists();
        }

        uint256 recordingDate = block.timestamp;

        maintenances[equipmentKey].push(
            MaintenanceProof({
                proofId: proofId,
                dataHash: dataHash,
                recordedAt: recordingDate
            })
        );

        registeredMaintenanceProofs[proofId] = true;

        emit MaintenanceAdded(
            equipmentKey,
            proofId,
            dataHash,
            recordingDate
        );
    }

    function getMaintenances(
        bytes32 equipmentKey
    ) external view returns (MaintenanceProof[] memory) {
        return maintenances[equipmentKey];
    }

    function getMaintenanceCount(
        bytes32 equipmentKey
    ) external view returns (uint256) {
        return maintenances[equipmentKey].length;
    }
}