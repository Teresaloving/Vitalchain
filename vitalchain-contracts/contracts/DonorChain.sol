// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, euint8, ebool, externalEuint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title DonorChain - Privacy-aware donation recorder (renamed from VitalChain/BloodChain)
/// @notice 功能等价于 BloodChain：加密累计次数、最近一次加密体积、公开透明计数与事件
contract DonorChain is SepoliaConfig {
    mapping(address => euint32) private _encDonationCount;
    mapping(address => euint32) private _encLastVolume;
    mapping(address => uint32) private _publicDonationCount;

    event VitalRecordLogged(
        address indexed user,
        string ipfsCid,
        uint64 date,
        bytes32 locationHash,
        bytes32 hospitalHash,
        uint8 donationCategory,
        uint32 transparentVolume,
        euint32 encVolume
    );

    /// @notice 记录一次献血
    function submitDonation(
        externalEuint32 inputVolume,
        bytes calldata inputProof,
        string calldata ipfsCid,
        uint64 date,
        bytes32 locationHash,
        bytes32 hospitalHash,
        uint8 donationCategory,
        uint32 transparentVolume
    ) external {
        euint32 current = _encDonationCount[msg.sender];
        euint32 next = FHE.add(current, FHE.asEuint32(1));
        _encDonationCount[msg.sender] = next;
        FHE.allowThis(next);
        FHE.allow(next, msg.sender);

        euint32 vol = FHE.fromExternal(inputVolume, inputProof);
        _encLastVolume[msg.sender] = vol;
        FHE.allowThis(vol);
        FHE.allow(vol, msg.sender);

        unchecked {
            _publicDonationCount[msg.sender] += 1;
        }

        emit VitalRecordLogged(
            msg.sender,
            ipfsCid,
            date,
            locationHash,
            hospitalHash,
            donationCategory,
            transparentVolume,
            vol
        );
    }

    /// @notice 获取本人加密累计次数
    function getMyEncryptedCount() external view returns (euint32) {
        return _encDonationCount[msg.sender];
    }

    /// @notice 获取任意地址的加密累计次数
    function getEncryptedCountOf(address user) external view returns (euint32) {
        return _encDonationCount[user];
    }

    /// @notice 获取本人最近一次加密体积
    function getMyEncryptedLastVolume() external view returns (euint32) {
        return _encLastVolume[msg.sender];
    }

    /// @notice 公共透明累计次数
    function getPublicCount(address user) external view returns (uint32) {
        return _publicDonationCount[user];
    }
}





