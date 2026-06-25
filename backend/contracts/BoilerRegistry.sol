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

    function registerBoiler(
        string memory _boilerId,
        string memory _qrCode,
        string memory _owner,
        string memory _location
    ) public {

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