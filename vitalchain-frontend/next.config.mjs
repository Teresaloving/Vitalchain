/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["ethers"],
  },
  env: {
    NEXT_PUBLIC_VITALCHAIN_ADDRESS: process.env.NEXT_PUBLIC_VITALCHAIN_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    NEXT_PUBLIC_HONORBAGE_ADDRESS: process.env.NEXT_PUBLIC_HONORBAGE_ADDRESS || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  },
};

export default nextConfig;


