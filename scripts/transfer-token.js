import { ethers } from "ethers";

const RPC_URL = "http://127.0.0.1:8545";

// Gunakan private key akun ADMIN dari Hardhat Local.
const ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Gunakan alamat MockToken dari deployment TERKINI.
const TOKEN_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Gunakan alamat wallet donatur dari MetaMask.
const DONOR_ADDRESS = "0x976ea74026e726554db657fa54763abd0c3a0aa9";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

    const artifact = await import("node:fs/promises");
    const tokenArtifact = JSON.parse(
      await artifact.readFile(
        "artifacts/contracts/MockToken.sol/MockToken.json",
        "utf8",
      ),
    );

    const token = new ethers.Contract(
      TOKEN_ADDRESS,
      tokenArtifact.abi,
      adminWallet,
    );

    const amount = ethers.parseUnits("100", 18);

    console.log("Admin:", await adminWallet.getAddress());
    console.log("Donor:", DONOR_ADDRESS);

    const tx = await token.transfer(DONOR_ADDRESS, amount);
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();

    console.log("Transfer berhasil!");
    console.log("Block:", receipt.blockNumber);
    console.log(
      "Saldo donatur:",
      ethers.formatUnits(await token.balanceOf(DONOR_ADDRESS), 18),
      "DRT",
    );
  } finally {
    await provider.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
