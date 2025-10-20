// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IDonorChain {
    function getPublicCount(address user) external view returns (uint32);
}

/// @title HonorBadgeNFT - Renamed version of MedalNFT, same functionality
contract DonorBadgeNFT is ERC721, Ownable, SepoliaConfig {
    IDonorChain public immutable vitalChain;

    uint32[] private _thresholds;
    string private _baseURIString;

    uint256 private _nextTokenId = 1;
    mapping(address => mapping(uint256 => bool)) private _claimedLevel;

    event BadgeMinted(address indexed user, uint256 indexed tokenId, uint256 levelIndex);

    constructor(address vitalChainAddress, uint32[] memory thresholds, string memory baseURI_)
        ERC721("VitalChain Honor Badge", "VCHONOR")
        Ownable(msg.sender)
    {
        vitalChain = IDonorChain(vitalChainAddress);
        _thresholds = thresholds;
        _baseURIString = baseURI_;
    }

    function setBaseURI(string calldata newBase) external onlyOwner {
        _baseURIString = newBase;
    }

    function thresholds() external view returns (uint32[] memory) {
        return _thresholds;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIString;
    }

    /// @notice Mint badge for a level index if user's public donation count >= threshold.
    function claimBadge(uint256 levelIndex) external {
        require(levelIndex < _thresholds.length, "invalid level");
        require(!_claimedLevel[msg.sender][levelIndex], "already claimed");

        uint32 count = vitalChain.getPublicCount(msg.sender);
        require(count >= _thresholds[levelIndex], "insufficient donations");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _claimedLevel[msg.sender][levelIndex] = true;
        emit BadgeMinted(msg.sender, tokenId, levelIndex);
    }
}





