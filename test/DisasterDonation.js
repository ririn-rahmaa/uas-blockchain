import { describe, it } from "mocha";
import { expect } from "chai";
import { network } from "hardhat";

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
});
