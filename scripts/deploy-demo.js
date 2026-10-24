import fs from "node:fs/promises";
import { ethers } from "ethers";

const RPC_URL = "http://127.0.0.1:8545";

// Gunakan private key akun lokal Hardhat #0 sampai #5.
// Hanya untuk jaringan lokal, jangan gunakan private key wallet sungguhan.
const PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

async function loadArtifact(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

async function send(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();

  console.log(`\n${label}`);
  console.log("Transaction:", tx.hash);
  console.log("Block:", receipt.blockNumber);
}

async function main() {
  if (PRIVATE_KEYS.some((key) => !key.startsWith("0x") || key.length !== 66)) {
    throw new Error("Isi semua 6 private key akun lokal Hardhat dengan benar.");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallets = PRIVATE_KEYS.map((key) => new ethers.Wallet(key, provider));

  const accounts = wallets.map((wallet) => new ethers.NonceManager(wallet));

  const [admin, donor, volunteer, amil, auditor, recipient] = accounts;

  const networkInfo = await provider.getNetwork();

  console.log("Connected to local EVM");
  console.log("Chain ID:", networkInfo.chainId.toString());
  console.log("Admin:", await admin.getAddress());
  console.log("Donor:", await donor.getAddress());
  console.log("Recipient:", await recipient.getAddress());

  // 1. Deploy MockToken
  const tokenArtifact = await loadArtifact(
    "artifacts/contracts/MockToken.sol/MockToken.json",
  );

  const tokenFactory = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    admin,
  );

  const token = await tokenFactory.deploy();
  const tokenDeployTx = token.deploymentTransaction();

  await token.waitForDeployment();

  console.log("\nMockToken deployed:", await token.getAddress());
  console.log("MockToken deployment transaction:", tokenDeployTx.hash);
  console.log(
    "MockToken deployment block:",
    (await tokenDeployTx.wait()).blockNumber,
  );

  // 2. Deploy DisasterDonation
  const donationArtifact = await loadArtifact(
    "artifacts/contracts/DisasterDonation.sol/DisasterDonation.json",
  );

  const donationFactory = new ethers.ContractFactory(
    donationArtifact.abi,
    donationArtifact.bytecode,
    admin,
  );

  const donation = await donationFactory.deploy(await token.getAddress());
  const donationDeployTx = donation.deploymentTransaction();

  await donation.waitForDeployment();

  console.log("DisasterDonation deployed:", await donation.getAddress());
  console.log(
    "DisasterDonation deployment transaction:",
    donationDeployTx.hash,
  );
  console.log(
    "DisasterDonation deployment block:",
    (await donationDeployTx.wait()).blockNumber,
  );

  // 3. Atur role pengguna
  await send(
    "Set volunteer role",
    donation.setVolunteer(await volunteer.getAddress(), true),
  );
  await send("Set amil role", donation.setAmil(await amil.getAddress(), true));
  await send(
    "Set auditor role",
    donation.setAuditor(await auditor.getAddress(), true),
  );

  // 4. Berikan token simulasi kepada donatur
  const donationAmount = ethers.parseUnits("100", 18);
  const disbursementAmount = ethers.parseUnits("10", 18);

  await send(
    "Mint 100 DRT to donor",
    token.mint(await donor.getAddress(), donationAmount),
  );

  await send(
    "Donor approves donation contract",
    token.connect(donor).approve(await donation.getAddress(), donationAmount),
  );

  // 5. Donatur mengirimkan donasi
  const donationTx = await donation.connect(donor).donate(donationAmount);

  const donationReceipt = await donationTx.wait();

  console.log("\nDonation transaction:", donationTx.hash);
  console.log("----------------");
  console.log("Donation block:", donationReceipt.blockNumber);

  for (const log of donationReceipt.logs) {
    try {
      const parsed = donation.interface.parseLog(log);

      if (parsed && parsed.name === "DonationReceived") {
        console.log("Event:", parsed.name);
        console.log("Donation ID:", parsed.args[0].toString());
      }
    } catch {
      // Abaikan log yang bukan berasal dari interface kontrak ini.
    }
  }

  // 6. Daftarkan dan verifikasi penerima
  const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("recipient-001"));
  const documentHash = ethers.keccak256(
    ethers.toUtf8Bytes("recipient-document"),
  );

  await send(
    "Volunteer submits recipient",
    donation
      .connect(volunteer)
      .submitRecipient(
        recipientHash,
        await recipient.getAddress(),
        documentHash,
      ),
  );

  await send(
    "Amil verifies recipient",
    donation.connect(amil).verifyRecipient(recipientHash),
  );

  await send(
    "Auditor approves recipient",
    donation.connect(auditor).approveRecipient(recipientHash),
  );

  // 7. Alokasikan seluruh donasi kepada penerima
  await send(
    "Allocate 100 DRT",
    donation.connect(amil).allocateDonation(1, recipientHash, donationAmount),
  );

  // 8. Ajukan pencairan sebagian dana
  await send(
    "Request disbursement of 10 DRT",
    donation
      .connect(amil)
      .requestDisbursement(1, disbursementAmount, documentHash),
  );

  // 9. Auditor menyetujui pencairan
  const balanceBefore = await token.balanceOf(await recipient.getAddress());

  const disbursementTx = await donation.connect(auditor).approveDisbursement(1);

  const disbursementReceipt = await disbursementTx.wait();

  console.log("\nDisbursement transaction:", disbursementTx.hash);
  console.log("---------");
  console.log("Disbursement block:", disbursementReceipt.blockNumber);

  for (const log of disbursementReceipt.logs) {
    try {
      const parsed = donation.interface.parseLog(log);

      if (parsed) {
        console.log("Event:", parsed.name);

        if (parsed.name === "DisbursementApproved") {
          console.log("Disbursement ID:", parsed.args[0].toString());
        }
      }
    } catch {
      // Abaikan log yang tidak cocok dengan interface kontrak.
    }
  }

  const balanceAfter = await token.balanceOf(await recipient.getAddress());
  const donationRecord = await donation.getDonation(1);
  const allocationRecord = await donation.getAllocation(1);
  const disbursementRecord = await donation.getDisbursement(1);

  console.log("\n========== FINAL RESULT ==========");
  console.log(
    "Recipient balance:",
    ethers.formatUnits(balanceAfter, 18),
    "DRT",
  );
  console.log(
    "Recipient received:",
    ethers.formatUnits(balanceAfter - balanceBefore, 18),
    "DRT",
  );
  console.log(
    "Donation amount:",
    ethers.formatUnits(donationRecord.amount, 18),
    "DRT",
  );
  console.log(
    "Allocated amount:",
    ethers.formatUnits(allocationRecord.amount, 18),
    "DRT",
  );
  console.log(
    "Disbursed amount:",
    ethers.formatUnits(allocationRecord.disbursedAmount, 18),
    "DRT",
  );
  console.log("Donation status:", donationRecord.status.toString());
  console.log("Disbursement status:", disbursementRecord.status.toString());
  console.log(
    "Remaining contract token balance:",
    ethers.formatUnits(await token.balanceOf(await donation.getAddress()), 18),
    "DRT",
  );

  await provider.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
