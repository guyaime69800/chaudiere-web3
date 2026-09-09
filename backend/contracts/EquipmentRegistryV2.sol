// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EquipmentRegistryV2 {
    struct Equipment {
        string equipmentId;
        string qrCode;
        string brand;
        string model;
        string productReference;
        string serialNumber;
        bool exists;
    }

    struct Maintenance {
        uint256 date;
        string interventionType;
        string description;
        string technician;
        string partChanged;
    }

    address public owner;
    bool public paused;

    mapping(address => bool) public writers;
    mapping(string => Equipment) public equipments;
    mapping(bytes32 => bool) public registeredSerialNumbers;
    mapping(string => Maintenance[]) private maintenances;

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
        string indexed equipmentId,
        string brand,
        string model,
        string productReference,
        string serialNumber
    );

    event MaintenanceAdded(
        string indexed equipmentId,
        string interventionType,
        string technician
    );

    error Unauthorized();
    error ContractPaused();
    error InvalidAddress();
    error InvalidValue();
    error EquipmentAlreadyExists();
    error SerialNumberAlreadyExists();
    error EquipmentNotFound();

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

        writers[writer] = authorized;
        emit WriterUpdated(writer, authorized);
    }

    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;
        emit PauseUpdated(newPaused);
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidAddress();
        }

        address previousOwner = owner;

        writers[previousOwner] = false;
        writers[newOwner] = true;
        owner = newOwner;

        emit WriterUpdated(previousOwner, false);
        emit WriterUpdated(newOwner, true);
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function registerEquipment(
        string memory equipmentId,
        string memory qrCode,
        string memory brand,
        string memory model,
        string memory productReference,
        string memory serialNumber
    ) external onlyWriter {
        if (
            bytes(equipmentId).length == 0 ||
            bytes(qrCode).length == 0 ||
            bytes(brand).length == 0 ||
            bytes(model).length == 0 ||
            bytes(serialNumber).length == 0
        ) {
            revert InvalidValue();
        }

        if (equipments[equipmentId].exists) {
            revert EquipmentAlreadyExists();
        }

        bytes32 serialHash = keccak256(bytes(serialNumber));

        if (registeredSerialNumbers[serialHash]) {
            revert SerialNumberAlreadyExists();
        }

        equipments[equipmentId] = Equipment({
            equipmentId: equipmentId,
            qrCode: qrCode,
            brand: brand,
            model: model,
            productReference: productReference,
            serialNumber: serialNumber,
            exists: true
        });

        registeredSerialNumbers[serialHash] = true;

        emit EquipmentRegistered(
            equipmentId,
            brand,
            model,
            productReference,
            serialNumber
        );
    }

    function addMaintenance(
        string memory equipmentId,
        string memory interventionType,
        string memory description,
        string memory technician,
        string memory partChanged
    ) external onlyWriter {
        if (!equipments[equipmentId].exists) {
            revert EquipmentNotFound();
        }

        if (
            bytes(interventionType).length == 0 ||
            bytes(description).length == 0 ||
            bytes(technician).length == 0
        ) {
            revert InvalidValue();
        }

        maintenances[equipmentId].push(
            Maintenance({
                date: block.timestamp,
                interventionType: interventionType,
                description: description,
                technician: technician,
                partChanged: partChanged
            })
        );

        emit MaintenanceAdded(
            equipmentId,
            interventionType,
            technician
        );
    }

    function getMaintenances(
        string memory equipmentId
    ) external view returns (Maintenance[] memory) {
        return maintenances[equipmentId];
    }
}