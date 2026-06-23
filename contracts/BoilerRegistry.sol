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

    mapping(string => Boiler) public boilers;

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

}