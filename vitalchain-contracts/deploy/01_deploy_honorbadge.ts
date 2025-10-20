import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get, log } = hre.deployments;

  const vital = await get("DonorChain");
  const thresholds = [1, 10, 20];
  const baseURI = "ipfs://"; // 根据需要替换

  const d = await deploy("DonorBadgeNFT", {
    from: deployer,
    args: [vital.address, thresholds, baseURI],
    log: true,
  });

  log(`DonorBadgeNFT deployed at ${d.address}`);
};

export default func;
func.id = "deploy_donorbadge";
func.tags = ["DonorBadgeNFT"];
func.dependencies = ["DonorChain"];



