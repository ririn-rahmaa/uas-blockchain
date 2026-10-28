import { describe, it } from "mocha";
import { expect } from "chai";
import { network } from "hardhat";
import { ethers } from "ethers";

describe("DisasterDonation", function () {
  async function deployFixture() {
    const { ethers } = await network.create();

    const [admin, donor, volunteer, amil, auditor, recipient] =
      await ethers.getSigners();

    const token = await ethers.deployContract("MockToken");
    await token.waitForDeployment();

    const donation = await ethers.deployContract("DisasterDonation", [
      await token.getAddress(),
    ]);
    await donation.waitForDeployment();

    await donation.connect(admin).setVolunteer(volunteer.address, true);
    await donation.connect(admin).setAmil(amil.address, true);
    await donation.connect(admin).setAuditor(auditor.address, true);

    const amount = ethers.parseUnits("100", 18);

    await token.mint(donor.address, amount);
    await token.connect(donor).approve(await donation.getAddress(), amount);

    return {
      ethers,
      admin,
      donor,
      volunteer,
      amil,
      auditor,
      recipient,
      token,
      donation,
      amount,
    };
  }

  async function prepareRecipient(f) {
    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-001"),
    );

    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-document"),
    );

    await f.donation
      .connect(f.volunteer)
      .submitRecipient(recipientHash, f.recipient.address, documentHash);

    await f.donation.connect(f.amil).verifyRecipient(recipientHash);
    await f.donation.connect(f.auditor).approveRecipient(recipientHash);

    return { recipientHash, documentHash };
  }

  async function prepareAllocation() {
    const f = await deployFixture();

    await f.donation.connect(f.donor).donate(f.amount);

    const { recipientHash, documentHash } = await prepareRecipient(f);

    await f.donation
      .connect(f.amil)
      .allocateDonation(1, recipientHash, f.amount);

    return { ...f, recipientHash, documentHash };
  }

  it("menerima donasi token dari donatur", async function () {
    const f = await deployFixture();

    await f.donation.connect(f.donor).donate(f.amount);

    expect(await f.token.balanceOf(await f.donation.getAddress())).to.equal(
      f.amount,
    );

    const record = await f.donation.getDonation(1);

    expect(record.donor).to.equal(f.donor.address);
    expect(record.amount).to.equal(f.amount);
    expect(record.allocatedAmount).to.equal(0);
    expect(record.exists).to.equal(true);
  });

  it("menolak alokasi melebihi dana yang belum dialokasikan", async function () {
    const f = await deployFixture();

    await f.donation.connect(f.donor).donate(f.amount);

    const { recipientHash } = await prepareRecipient(f);

    await expect(
      f.donation
        .connect(f.amil)
        .allocateDonation(1, recipientHash, f.amount + 1n),
    ).to.be.revertedWith("Insufficient unallocated donation");
  });

  it("menolak pencairan oleh akun yang bukan auditor", async function () {
    const f = await prepareAllocation();

    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, f.ethers.parseUnits("1", 18), f.documentHash);

    await expect(
      f.donation.connect(f.amil).approveDisbursement(1),
    ).to.be.revertedWith("Only auditor");
  });

  it("penolakan pencairan tidak mengurangi saldo alokasi", async function () {
    const f = await prepareAllocation();
    const requestedAmount = f.ethers.parseUnits("1", 18);

    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, requestedAmount, f.documentHash);

    const reasonHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("Evidence incomplete"),
    );

    await f.donation.connect(f.auditor).rejectDisbursement(1, reasonHash);

    const allocation = await f.donation.getAllocation(1);
    const request = await f.donation.getDisbursement(1);

    expect(allocation.amount).to.equal(f.amount);
    expect(allocation.disbursedAmount).to.equal(0);
    expect(allocation.reservedAmount).to.equal(0);

    // PENDING = 0, APPROVED = 1, REJECTED = 2
    expect(request.status).to.equal(2);
  });

  it("mentransfer token kepada penerima setelah auditor menyetujui", async function () {
    const f = await prepareAllocation();
    const requestedAmount = f.ethers.parseUnits("1", 18);

    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, requestedAmount, f.documentHash);

    const balanceBefore = await f.token.balanceOf(f.recipient.address);

    await f.donation.connect(f.auditor).approveDisbursement(1);

    const balanceAfter = await f.token.balanceOf(f.recipient.address);
    const allocation = await f.donation.getAllocation(1);
    const request = await f.donation.getDisbursement(1);

    expect(balanceAfter - balanceBefore).to.equal(requestedAmount);
    expect(allocation.disbursedAmount).to.equal(requestedAmount);
    expect(request.status).to.equal(1);
  });

  it("menolak alokasi kepada penerima yang belum diverifikasi", async function () {
    const f = await deployFixture();

    await f.donation.connect(f.donor).donate(f.amount);

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("unverified-recipient"),
    );

    await f.donation
      .connect(f.volunteer)
      .submitRecipient(
        recipientHash,
        f.recipient.address,
        f.ethers.keccak256(f.ethers.toUtf8Bytes("document")),
      );

    await expect(
      f.donation.connect(f.amil).allocateDonation(1, recipientHash, f.amount),
    ).to.be.revertedWith("Amil verification required");
  });

  it("menolak donasi dengan nominal nol", async function () {
    const f = await deployFixture();

    await expect(f.donation.connect(f.donor).donate(0)).to.be.revertedWith(
      "Amount must be positive",
    );
  });

  it("menolak pengajuan pencairan dengan nominal nol", async function () {
    const f = await prepareAllocation();

    await expect(
      f.donation.connect(f.amil).requestDisbursement(1, 0, f.documentHash),
    ).to.be.revertedWith("Amount must be positive");
  });

  it("tidak mengirim token dua kali untuk pencairan yang sama", async function () {
    const f = await prepareAllocation();
    const requestedAmount = f.ethers.parseUnits("10", 18);

    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, requestedAmount, f.documentHash);

    await f.donation.connect(f.auditor).approveDisbursement(1);

    const balanceAfterFirstApproval = await f.token.balanceOf(
      f.recipient.address,
    );

    await expect(
      f.donation.connect(f.auditor).approveDisbursement(1),
    ).to.be.revertedWith("Request is not pending");

    const balanceAfterSecondAttempt = await f.token.balanceOf(
      f.recipient.address,
    );

    expect(balanceAfterSecondAttempt).to.equal(balanceAfterFirstApproval);
  });

  it("mempertahankan status ALLOCATED jika baru sebagian dana dicairkan", async function () {
    const f = await prepareAllocation();

    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, f.ethers.parseUnits("10", 18), f.documentHash);

    await f.donation.connect(f.auditor).approveDisbursement(1);

    const donation = await f.donation.getDonation(1);

    // RECEIVED = 0, ALLOCATED = 1, DISBURSED = 2
    expect(donation.status).to.equal(1);
    expect(donation.disbursedAmount).to.equal(f.ethers.parseUnits("10", 18));
  });

  it("mengubah status menjadi DISBURSED setelah seluruh dana dicairkan", async function () {
    const f = await prepareAllocation();

    // Ajukan pencairan seluruh dana yang dialokasikan
    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, f.amount, f.documentHash);

    // Auditor menyetujui pencairan
    await f.donation.connect(f.auditor).approveDisbursement(1);

    // Periksa status dan jumlah dana yang telah dicairkan
    const donation = await f.donation.getDonation(1);
    const recipientBalance = await f.token.balanceOf(f.recipient.address);

    // RECEIVED = 0, ALLOCATED = 1, DISBURSED = 2
    expect(donation.status).to.equal(2);
    expect(donation.disbursedAmount).to.equal(f.amount);
    expect(recipientBalance).to.equal(f.amount);
  });

  it("mengizinkan pengajuan pencairan baru setelah pencairan sebelumnya ditolak", async function () {
    const f = await prepareAllocation();

    const requestedAmount = f.ethers.parseUnits("10", 18);
    const reasonHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("Evidence incomplete"),
    );

    // Pengajuan pencairan pertama
    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, requestedAmount, f.documentHash);

    // Auditor menolak pencairan pertama
    await f.donation.connect(f.auditor).rejectDisbursement(1, reasonHash);

    // Pastikan dana yang dicadangkan telah dilepaskan
    const allocationAfterRejection = await f.donation.getAllocation(1);

    expect(allocationAfterRejection.reservedAmount).to.equal(0);
    expect(allocationAfterRejection.disbursedAmount).to.equal(0);

    // Pengajuan pencairan kedua
    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, requestedAmount, f.documentHash);

    // Pastikan permintaan kedua berstatus PENDING
    const secondRequest = await f.donation.getDisbursement(2);
    const allocationAfterResubmission = await f.donation.getAllocation(1);

    // PENDING = 0
    expect(secondRequest.status).to.equal(0);
    expect(secondRequest.amount).to.equal(requestedAmount);
    expect(allocationAfterResubmission.reservedAmount).to.equal(
      requestedAmount,
    );
  });

  it("menolak pemberian role Auditor kepada akun yang sudah menjadi Amil", async function () {
    const f = await deployFixture();

    await expect(
      f.donation.connect(f.admin).setAuditor(f.amil.address, true),
    ).to.be.revertedWith("Role conflict");
  });

  it("menolak pemberian role Amil kepada akun yang sudah menjadi Auditor", async function () {
    const f = await deployFixture();

    await expect(
      f.donation.connect(f.admin).setAmil(f.auditor.address, true),
    ).to.be.revertedWith("Role conflict");
  });

  it("menolak pendaftaran penerima oleh akun tanpa role volunteer", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-unauthorized"),
    );

    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("document-unauthorized"),
    );

    await expect(
      f.donation
        .connect(f.donor)
        .submitRecipient(recipientHash, f.recipient.address, documentHash),
    ).to.be.revertedWith("Only volunteer");
  });

  it("mengizinkan Regulator membaca saldo token kontrak", async function () {
    const f = await deployFixture();

    await f.donation.connect(f.admin).setRegulator(f.recipient.address, true);

    const balance = await f.donation
      .connect(f.recipient)
      .getContractTokenBalance();

    expect(balance).to.equal(0n);
  });

  it("menolak pembacaan saldo token kontrak oleh akun tanpa role Auditor atau Regulator", async function () {
    const f = await deployFixture();

    await expect(
      f.donation.connect(f.donor).getContractTokenBalance(),
    ).to.be.revertedWith("Only auditor or regulator");
  });

  it("menolak pemberian role Amil kepada alamat nol", async function () {
    const f = await deployFixture();

    await expect(
      f.donation
        .connect(f.admin)
        .setAmil("0x0000000000000000000000000000000000000000", true),
    ).to.be.revertedWith("Invalid address");
  });

  it("menolak pemberian role Auditor kepada alamat nol", async function () {
    const f = await deployFixture();

    await expect(
      f.donation
        .connect(f.admin)
        .setAuditor("0x0000000000000000000000000000000000000000", true),
    ).to.be.revertedWith("Invalid address");
  });

  it("mengizinkan akun menjadi Auditor setelah role Amil dicabut", async function () {
    const f = await deployFixture();

    // Cabut role Amil
    await f.donation.connect(f.admin).setAmil(f.amil.address, false);

    // Pastikan role Amil sudah dicabut
    expect(await f.donation.amils(f.amil.address)).to.equal(false);

    // Berikan role Auditor kepada akun yang sama
    await f.donation.connect(f.admin).setAuditor(f.amil.address, true);

    // Pastikan role Auditor berhasil diberikan
    expect(await f.donation.auditors(f.amil.address)).to.equal(true);
  });

  it("mengizinkan akun menjadi Amil setelah role Auditor dicabut", async function () {
    const f = await deployFixture();

    // Cabut role Auditor
    await f.donation.connect(f.admin).setAuditor(f.auditor.address, false);

    // Pastikan role Auditor sudah dicabut
    expect(await f.donation.auditors(f.auditor.address)).to.equal(false);

    // Berikan role Amil kepada akun yang sama
    await f.donation.connect(f.admin).setAmil(f.auditor.address, true);

    // Pastikan role Amil berhasil diberikan
    expect(await f.donation.amils(f.auditor.address)).to.equal(true);
  });
  it("blocks reentrancy during disbursement approval", async function () {
    const { ethers } = await network.create();

    const token = await ethers.deployContract("ReentrantToken");
    await token.waitForDeployment();

    const donation = await ethers.deployContract("DisasterDonation", [
      await token.getAddress(),
    ]);
    await donation.waitForDeployment();

    const [admin, donor, volunteer, amil, auditor, recipient] =
      await ethers.getSigners();

    const attacker = await ethers.deployContract("AttackingAuditor", [
      await donation.getAddress(),
      await token.getAddress(),
    ]);
    await attacker.waitForDeployment();

    await donation.connect(admin).setVolunteer(volunteer.address, true);
    await donation.connect(admin).setAmil(amil.address, true);
    await donation.connect(admin).setAuditor(await attacker.getAddress(), true);
    await donation.connect(admin).setAuditor(auditor.address, true);

    const amount = ethers.parseUnits("100", 18);
    await token.mint(donor.address, amount);
    await token.connect(donor).approve(await donation.getAddress(), amount);
    await donation.connect(donor).donate(amount);

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("recipient"));
    const documentHash = ethers.keccak256(ethers.toUtf8Bytes("document"));

    await donation
      .connect(volunteer)
      .submitRecipient(recipientHash, recipient.address, documentHash);

    await donation.connect(amil).verifyRecipient(recipientHash);

    await donation.connect(auditor).approveRecipient(recipientHash);

    await donation.connect(amil).allocateDonation(1, recipientHash, amount);

    await donation.connect(amil).requestDisbursement(1, amount, documentHash);

    await token.configureAttack(
      await donation.getAddress(),
      await attacker.getAddress(),
    );

    await attacker.attack(1);

    if (!(await attacker.reentryAttempted())) {
      throw new Error("Reentry was not attempted");
    }

    if (!(await attacker.reentryBlocked())) {
      throw new Error("Reentry was not blocked");
    }
  });
  it("menolak permintaan pencairan yang totalnya melebihi sisa alokasi", async function () {
    const f = await prepareAllocation();

    const firstAmount = f.ethers.parseUnits("60", 18);
    const secondAmount = f.ethers.parseUnits("50", 18);

    // Permintaan pertama mencadangkan 60 token.
    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, firstAmount, f.documentHash);

    // Permintaan kedua membuat total cadangan menjadi 110 token,
    // padahal alokasi hanya sebesar 100 token.
    await expect(
      f.donation
        .connect(f.amil)
        .requestDisbursement(1, secondAmount, f.documentHash),
    ).to.be.revert(ethers);

    const allocation = await f.donation.getAllocation(1);

    // Cadangan seharusnya tetap 60 token.
    expect(allocation.reservedAmount).to.equal(firstAmount);
  });

  it("mengembalikan state jika transfer token saat pencairan gagal", async function () {
    const { ethers } = await network.create();

    const [admin, donor, volunteer, amil, auditor, recipient] =
      await ethers.getSigners();

    const token = await ethers.deployContract("FailingToken");
    await token.waitForDeployment();

    const donation = await ethers.deployContract("DisasterDonation", [
      await token.getAddress(),
    ]);
    await donation.waitForDeployment();

    await donation.connect(admin).setVolunteer(volunteer.address, true);
    await donation.connect(admin).setAmil(amil.address, true);
    await donation.connect(admin).setAuditor(auditor.address, true);

    const amount = ethers.parseUnits("100", 18);
    const requestedAmount = ethers.parseUnits("40", 18);

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("recipient-dos"));
    const documentHash = ethers.keccak256(ethers.toUtf8Bytes("document-dos"));

    await token.mint(donor.address, amount);
    await token.connect(donor).approve(await donation.getAddress(), amount);
    await donation.connect(donor).donate(amount);

    await donation
      .connect(volunteer)
      .submitRecipient(recipientHash, recipient.address, documentHash);
    await donation.connect(amil).verifyRecipient(recipientHash);
    await donation.connect(auditor).approveRecipient(recipientHash);

    await donation.connect(amil).allocateDonation(1, recipientHash, amount);

    await donation
      .connect(amil)
      .requestDisbursement(1, requestedAmount, documentHash);

    await token.setFailTransfers(true);

    await expect(donation.connect(auditor).approveDisbursement(1)).to.be.revert(
      ethers,
    );

    const allocation = await donation.getAllocation(1);
    const request = await donation.getDisbursement(1);
    const record = await donation.getDonation(1);

    expect(allocation.reservedAmount).to.equal(requestedAmount);
    expect(allocation.disbursedAmount).to.equal(0n);
    expect(request.status).to.equal(0); // PENDING
    expect(record.disbursedAmount).to.equal(0n);
  });
  it("menolak deployment dengan alamat token nol", async function () {
    const { ethers } = await network.create();

    await expect(
      ethers.deployContract("DisasterDonation", [ethers.ZeroAddress]),
    ).to.be.revert(ethers);
  });

  it("menolak pendaftaran penerima dengan hash nol", async function () {
    const f = await deployFixture();

    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("document-test"),
    );

    await expect(
      f.donation
        .connect(f.volunteer)
        .submitRecipient(f.ethers.ZeroHash, f.recipient.address, documentHash),
    ).to.be.revertedWith("Invalid recipient hash");
  });

  it("menolak pendaftaran penerima dengan wallet nol", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-test"),
    );
    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("document-test"),
    );

    await expect(
      f.donation
        .connect(f.volunteer)
        .submitRecipient(recipientHash, f.ethers.ZeroAddress, documentHash),
    ).to.be.revertedWith("Invalid wallet");
  });

  it("menolak pendaftaran penerima dengan hash dokumen nol", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-test"),
    );

    await expect(
      f.donation
        .connect(f.volunteer)
        .submitRecipient(recipientHash, f.recipient.address, f.ethers.ZeroHash),
    ).to.be.revertedWith("Invalid document hash");
  });

  it("menolak pendaftaran penerima dengan hash yang sudah terdaftar", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("duplicate-recipient"),
    );
    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-document"),
    );

    await f.donation
      .connect(f.volunteer)
      .submitRecipient(recipientHash, f.recipient.address, documentHash);

    await expect(
      f.donation
        .connect(f.volunteer)
        .submitRecipient(recipientHash, f.recipient.address, documentHash),
    ).to.be.revertedWith("Recipient exists");
  });

  it("menolak alokasi dengan ID donasi yang tidak ditemukan", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-for-invalid-donation"),
    );

    await f.donation
      .connect(f.volunteer)
      .submitRecipient(
        recipientHash,
        f.recipient.address,
        f.ethers.keccak256(f.ethers.toUtf8Bytes("document")),
      );

    await f.donation.connect(f.amil).verifyRecipient(recipientHash);
    await f.donation.connect(f.auditor).approveRecipient(recipientHash);

    await expect(
      f.donation
        .connect(f.amil)
        .allocateDonation(999, recipientHash, f.ethers.parseUnits("1", 18)),
    ).to.be.revertedWith("Donation not found");
  });

  it("menolak pengajuan pencairan dengan ID alokasi yang tidak ditemukan", async function () {
    const f = await deployFixture();

    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("disbursement-document"),
    );

    await expect(
      f.donation
        .connect(f.amil)
        .requestDisbursement(999, f.ethers.parseUnits("1", 18), documentHash),
    ).to.be.revertedWith("Allocation not found");
  });

  it("menolak pengajuan pencairan dengan hash dokumen nol", async function () {
    const f = await prepareAllocation();

    await expect(
      f.donation
        .connect(f.amil)
        .requestDisbursement(
          1,
          f.ethers.parseUnits("1", 18),
          f.ethers.ZeroHash,
        ),
    ).to.be.revertedWith("Invalid document hash");
  });

  it("menolak penolakan pencairan dengan hash alasan nol", async function () {
    const f = await prepareAllocation();

    await f.donation
      .connect(f.amil)
      .requestDisbursement(1, f.ethers.parseUnits("1", 18), f.documentHash);

    await expect(
      f.donation.connect(f.auditor).rejectDisbursement(1, f.ethers.ZeroHash),
    ).to.be.revertedWith("Invalid reason hash");
  });

  it("menolak pembacaan donasi dengan ID yang tidak ditemukan", async function () {
    const f = await deployFixture();

    await expect(f.donation.getDonation(999)).to.be.revertedWith(
      "Donation not found",
    );
  });

  it("menolak pembacaan penerima dengan hash yang tidak ditemukan", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("unknown-recipient"),
    );

    await expect(f.donation.getRecipient(recipientHash)).to.be.revertedWith(
      "Recipient not found",
    );
  });

  it("menolak pembacaan alokasi dengan ID yang tidak ditemukan", async function () {
    const f = await deployFixture();

    await expect(f.donation.getAllocation(999)).to.be.revertedWith(
      "Allocation not found",
    );
  });

  it("menolak pembacaan pencairan dengan ID yang tidak ditemukan", async function () {
    const f = await deployFixture();

    await expect(f.donation.getDisbursement(999)).to.be.revertedWith(
      "Disbursement not found",
    );
  });

  it("menolak alokasi dengan nominal nol", async function () {
    const f = await deployFixture();

    await f.donation.connect(f.donor).donate(f.amount);

    const { recipientHash } = await prepareRecipient(f);

    await expect(
      f.donation.connect(f.amil).allocateDonation(1, recipientHash, 0),
    ).to.be.revertedWith("Amount must be positive");
  });

  it("menolak verifikasi penerima yang tidak ditemukan", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("unknown-recipient"),
    );

    await expect(
      f.donation.connect(f.amil).verifyRecipient(recipientHash),
    ).to.be.revertedWith("Recipient not found");
  });

  it("menolak verifikasi Amil yang dilakukan dua kali", async function () {
    const f = await deployFixture();
    const { recipientHash } = await prepareRecipient(f);

    await expect(
      f.donation.connect(f.amil).verifyRecipient(recipientHash),
    ).to.be.revertedWith("Already verified by amil");
  });

  it("menolak persetujuan auditor sebelum verifikasi Amil", async function () {
    const f = await deployFixture();

    const recipientHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-not-verified"),
    );
    const documentHash = f.ethers.keccak256(
      f.ethers.toUtf8Bytes("recipient-document"),
    );

    await f.donation
      .connect(f.volunteer)
      .submitRecipient(recipientHash, f.recipient.address, documentHash);

    await expect(
      f.donation.connect(f.auditor).approveRecipient(recipientHash),
    ).to.be.revertedWith("Amil verification required");
  });

  it("menolak persetujuan auditor yang dilakukan dua kali", async function () {
    const f = await deployFixture();
    const { recipientHash } = await prepareRecipient(f);

    await expect(
      f.donation.connect(f.auditor).approveRecipient(recipientHash),
    ).to.be.revertedWith("Already auditor verified");
  });
});
