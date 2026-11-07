import { network } from "hardhat";

const { ethers } = await network.create();

async function main() {
  const txHash =
    "0x74a6ca699fb124decccbf5968ef776576b2dc1b1bc8ef4814239ae4554dd310b";

  const receipt = await ethers.provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("Transaksi tidak ditemukan pada node yang sedang aktif.");
    return;
  }

  console.log("Transaction hash :", receipt.hash);
  console.log(
    "Status           :",
    receipt.status === 1 ? "Berhasil" : "Gagal",
  );
  console.log("Block number     :", receipt.blockNumber);
  console.log("Contract address :", receipt.to);

  const iface = new ethers.Interface([
    "event DonationReceived(uint256 indexed donationId, address indexed donor, uint256 amount)",
  ]);

  let found = false;

  for (const log of receipt.logs) {
    try {
      const event = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      if (event?.name === "DonationReceived") {
        found = true;
        console.log("Event            :", event.name);
        console.log("Donation ID      :", event.args.donationId.toString());
        console.log("Donor            :", event.args.donor);
        console.log("Amount raw       :", event.args.amount.toString());
      }
    } catch {
      // Abaikan log yang bukan DonationReceived.
    }
  }

  if (!found) {
    console.log("Event DonationReceived tidak ditemukan.");
  }
}

await main();
