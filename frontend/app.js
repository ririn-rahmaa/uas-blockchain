// DonasiChain frontend — ethers v6. Kontrak tidak diubah.
const CONFIG = {
  chainId: 31337,
  tokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  donationAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};
const $ = (id) => document.getElementById(id);
let provider, signer, token, donation, account, toastTimer;
const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];
const DONATION_ABI = [
  "function donate(uint256 amount) returns (uint256 donationId)",
  "function getDonation(uint256 donationId) view returns (tuple(address donor,uint256 amount,uint256 allocatedAmount,uint256 disbursedAmount,uint8 status,bool exists))",
  "function nextDonationId() view returns (uint256)",
  "event DonationReceived(uint256 indexed donationId,address indexed donor,uint256 amount)",

  "function admin() view returns (address)",
  "function amils(address) view returns (bool)",
  "function volunteers(address) view returns (bool)",
  "function auditors(address) view returns (bool)",
  "function regulators(address) view returns (bool)",

  "function setAmil(address,bool)",
  "function setVolunteer(address,bool)",
  "function setAuditor(address,bool)",
  "function setRegulator(address,bool)",

  "function requestDisbursement(uint256 allocationId,uint256 amount,bytes32 documentHash)",
  "function getDisbursement(uint256 requestId) view returns (tuple(uint256 allocationId,uint256 amount,bytes32 documentHash,uint8 status,bytes32 rejectionReasonHash))",
  "function approveDisbursement(uint256 requestId)",
  "function rejectDisbursement(uint256 requestId,bytes32 reasonHash)",
  "function nextDisbursementId() view returns (uint256)",

  "function nextAllocationId() view returns (uint256)",
  "function getAllocation(uint256 allocationId) view returns (tuple(uint256 donationId, bytes32 recipientHash, uint256 amount, uint256 disbursedAmount, uint256 reservedAmount, bool exists))",
  "function allocateDonation(uint256 donationId, bytes32 recipientHash, uint256 amount)",

  "function submitRecipient(bytes32 recipientHash, address wallet, bytes32 documentHash)",
  "function verifyRecipient(bytes32 recipientHash)",
  "function approveRecipient(bytes32 recipientHash)",
  "function getRecipient(bytes32 recipientHash) view returns (tuple(address wallet, address submittedBy, bytes32 documentHash, bool amilVerified, bool auditorVerified, bool exists))",

  "event RecipientSubmitted(bytes32 indexed recipientHash,address indexed wallet,address submittedBy)",
  "event RecipientVerified(bytes32 indexed recipientHash,address indexed verifier,string verifierRole)",
  "event DonationAllocated(uint256 indexed allocationId,uint256 indexed donationId,bytes32 indexed recipientHash,uint256 amount)",
  "event DisbursementRequested(uint256 indexed disbursementId,uint256 indexed allocationId,uint256 amount)",
  "event DisbursementApproved(uint256 indexed disbursementId,address indexed recipientWallet,uint256 amount)",
  "event DisbursementRejected(uint256 indexed disbursementId,address indexed auditor,bytes32 reasonHash)",
];
const short = (s) => (s ? `${s.slice(0, 8)}…${s.slice(-6)}` : "—");

async function detectRole(address) {
  const checks = await Promise.all([
    donation.admin(),
    donation.amils(address),
    donation.volunteers(address),
    donation.auditors(address),
    donation.regulators(address),
  ]);

  const roles = [];

  if (checks[0].toLowerCase() === address.toLowerCase()) {
    roles.push("Admin");
  }
  if (checks[1]) roles.push("Amil");
  if (checks[2]) roles.push("Volunteer");
  if (checks[3]) roles.push("Auditor");
  if (checks[4]) roles.push("Regulator");

  return roles.length ? roles.join(", ") : "Belum memiliki role";
}

function updateRolePanels(roleText) {
  const roles =
    roleText === "Belum memiliki role"
      ? []
      : roleText.split(",").map((r) => r.trim());

  document.querySelectorAll("[data-role-panel]").forEach((panel) => {
    const allowedRoles = panel.dataset.rolePanel
      .split(",")
      .map((r) => r.trim());

    panel.style.display = allowedRoles.some((r) => roles.includes(r))
      ? ""
      : "none";
  });

  document.querySelectorAll("[data-requires-wallet]").forEach((panel) => {
    panel.hidden = !account || roles.length > 0;
  });
}

async function submitDonation() {
  if (!token || !donation || !account) {
    setMessage(
      "donorMessage",
      "Hubungkan wallet MetaMask terlebih dahulu.",
      "error",
    );
    return;
  }

  const button = $("submitDonationBtn");

  try {
    const amountText = $("donorAmount").value.trim();

    if (
      !amountText ||
      !Number.isFinite(Number(amountText)) ||
      Number(amountText) <= 0
    ) {
      throw Error("Masukkan nominal donasi yang valid.");
    }

    const amount = ethers.parseUnits(amountText, 18);
    const tokenAddress = await token.getAddress();
    const donationAddress = await donation.getAddress();

    button.disabled = true;
    setMessage("donorMessage", "Meminta persetujuan token di MetaMask...");

    // Izinkan kontrak donasi mengambil token DRT dari wallet.
    const approveTx = await token.approve(donationAddress, amount);
    await approveTx.wait();

    setMessage(
      "donorMessage",
      "Persetujuan token berhasil. Mengirim donasi...",
    );

    const donateTx = await donation.donate(amount);
    setMessage(
      "donorMessage",
      "Transaksi donasi dikirim. Menunggu konfirmasi...",
    );

    const receipt = await donateTx.wait();

    let donationId = null;

    for (const log of receipt.logs) {
      try {
        const parsed = donation.interface.parseLog(log);

        if (parsed?.name === "DonationReceived") {
          donationId = parsed.args.donationId.toString();
          break;
        }
      } catch {
        // Abaikan log dari kontrak lain.
      }
    }

    $("donorAmount").value = "";

    setMessage(
      "donorMessage",
      `Donasi berhasil${
        donationId ? `! ID Donasi: ${donationId}` : "."
      } Transaction: ${donateTx.hash}`,
      "success",
    );

    await refresh();
    await loadDonorHistory();
  } catch (e) {
    console.error(e);
    setMessage(
      "donorMessage",
      e.shortMessage || e.reason || e.message || "Donasi gagal.",
      "error",
    );
  } finally {
    button.disabled = false;
  }
}

async function loadDonorHistory() {
  const body = $("donorHistoryBody");

  if (!donation || !provider || !account) {
    setMessage(
      "donorHistoryMessage",
      "Hubungkan wallet terlebih dahulu.",
      "error",
    );
    return;
  }

  try {
    setMessage("donorHistoryMessage", "Memuat riwayat donasi...");
    body.replaceChildren();

    const filter = donation.filters.DonationReceived(null, account);
    const events = await donation.queryFilter(
      filter,
      0,
      await provider.getBlockNumber(),
    );

    const rows = await Promise.all(
      events.map(async (event) => {
        const id = event.args.donationId;
        const data = await donation.getDonation(id);

        const statuses = ["Diterima", "Dialokasikan", "Tersalurkan"];

        return {
          id: id.toString(),
          amount: fmt(data.amount),
          status: statuses[Number(data.status)] ?? "Tidak diketahui",
          hash: event.transactionHash,
          block: event.blockNumber,
        };
      }),
    );

    rows.sort((a, b) => b.block - a.block);

    if (!rows.length) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 4;
      cell.textContent = "Belum ada donasi dari wallet ini.";

      setMessage("donorHistoryMessage", "Belum ada riwayat donasi.");
      return;
    }

    for (const item of rows) {
      const row = body.insertRow();

      row.insertCell().textContent = `#${item.id}`;
      row.insertCell().textContent = `${item.amount} DRT`;
      row.insertCell().textContent = item.status;

      const cell = row.insertCell();
      const link = document.createElement("a");

      link.href = "#";
      link.textContent = `${item.hash.slice(0, 10)}…${item.hash.slice(-6)}`;
      link.title = item.hash;

      link.addEventListener("click", async (e) => {
        e.preventDefault();

        try {
          await navigator.clipboard.writeText(item.hash);
          toast("Transaction hash disalin.");
        } catch {
          toast(item.hash);
        }
      });

      cell.appendChild(link);
    }

    setMessage(
      "donorHistoryMessage",
      `${rows.length} transaksi donasi ditemukan.`,
      "success",
    );
  } catch (e) {
    console.error(e);
    setMessage(
      "donorHistoryMessage",
      e.shortMessage || e.reason || e.message || "Gagal memuat riwayat.",
      "error",
    );
  }
}

async function loadAuditTrail() {
  if (!donation || !provider || !account) return;

  const button = $("loadAuditTrailBtn");
  const body = $("auditTrailBody");

  try {
    const [isAuditor, isRegulator] = await Promise.all([
      donation.auditors(account),
      donation.regulators(account),
    ]);

    if (!isAuditor && !isRegulator) {
      throw Error("Fitur audit hanya untuk Auditor atau Regulator.");
    }

    button.disabled = true;
    setMessage(
      "auditTrailMessage",
      "Membaca event transaksi dari blockchain...",
    );

    const latestBlock = await provider.getBlockNumber();

    const eventNames = [
      "DonationReceived",
      "RecipientSubmitted",
      "RecipientVerified",
      "DonationAllocated",
      "DisbursementRequested",
      "DisbursementApproved",
      "DisbursementRejected",
    ];

    const results = await Promise.all(
      eventNames.map(async (name) => {
        const filter = donation.filters[name]();
        return donation.queryFilter(filter, 0, latestBlock);
      }),
    );

    const events = results
      .flat()
      .sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

    body.replaceChildren();

    if (events.length === 0) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = "Belum ada event transaksi di blockchain.";
      setMessage("auditTrailMessage", "Tidak ada riwayat transaksi.");
      return;
    }

    const shortHash = (value) =>
      value && value.length > 18
        ? `${value.slice(0, 10)}…${value.slice(-6)}`
        : value || "—";

    function describeEvent(event) {
      const a = event.args;
      const name = event.fragment.name;

      switch (name) {
        case "DonationReceived":
          return {
            activity: "Donasi masuk",
            detail: `Donasi #${a.donationId} · ${fmt(
              a.amount,
            )} DRT · Donatur ${shortHash(a.donor)}`,
            status: "Tercatat",
          };

        case "RecipientSubmitted":
          return {
            activity: "Pendaftaran penerima",
            detail: `Hash penerima ${shortHash(
              a.recipientHash,
            )} · Wallet ${shortHash(a.wallet)}`,
            status: "Diajukan",
            allowedRoles: ["Volunteer"],
          };

        case "RecipientVerified":
          return {
            activity: "Verifikasi penerima",
            detail: `Hash penerima ${shortHash(
              a.recipientHash,
            )} · Verifikator ${shortHash(a.verifier)}`,
            status: `Diverifikasi (${a.verifierRole})`,
            allowedRoles: ["Amil", "Auditor"],
          };

        case "DonationAllocated":
          return {
            activity: "Alokasi dana",
            detail: `Alokasi #${a.allocationId} · Donasi #${
              a.donationId
            } · ${fmt(a.amount)} DRT · Penerima ${shortHash(a.recipientHash)}`,
            status: "Dialokasikan",
            allowedRoles: ["Amil"],
          };

        case "DisbursementRequested":
          return {
            activity: "Pengajuan penyaluran",
            detail: `Pengajuan #${a.disbursementId} · Alokasi #${
              a.allocationId
            } · ${fmt(a.amount)} DRT`,
            status: "Menunggu persetujuan",
            allowedRoles: ["Amil"],
          };

        case "DisbursementApproved":
          return {
            activity: "Persetujuan penyaluran",
            detail: `Pengajuan #${a.disbursementId} · ${fmt(
              a.amount,
            )} DRT · Penerima ${shortHash(a.recipientWallet)}`,
            status: "Disetujui / ditransfer",
            allowedRoles: ["Auditor"],
          };

        case "DisbursementRejected":
          return {
            activity: "Penolakan penyaluran",
            detail: `Pengajuan #${a.disbursementId} · Auditor ${shortHash(
              a.auditor,
            )} · Hash alasan ${shortHash(a.reasonHash)}`,
            status: "Ditolak",
            allowedRoles: ["Auditor"],
          };

        default:
          return {
            activity: name,
            detail: "—",
            status: "Tercatat",
          };
      }
    }

    for (const event of events.slice().reverse()) {
      const info = describeEvent(event);

      if (
        info.allowedRoles &&
        !info.allowedRoles.some((role) => activeRoles.includes(role))
      ) {
        continue;
      }

      const row = body.insertRow();

      const blockCell = row.insertCell();
      blockCell.textContent = String(event.blockNumber);

      const activityCell = row.insertCell();
      activityCell.textContent = info.activity;

      const detailCell = row.insertCell();
      detailCell.textContent = info.detail;

      const statusCell = row.insertCell();
      statusCell.textContent = info.status;

      const txCell = row.insertCell();
      const link = document.createElement("a");
      link.href = "#";
      link.className = "hash";
      link.textContent = shortHash(event.transactionHash);
      link.title = event.transactionHash;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        navigator.clipboard?.writeText(event.transactionHash).then(
          () => toast("Transaction hash disalin."),
          () => toast(event.transactionHash),
        );
      });
      txCell.appendChild(link);
    }

    setMessage(
      "auditTrailMessage",
      `${events.length} event ditemukan hingga blok ${latestBlock}.`,
      "success",
    );
  } catch (e) {
    console.error(e);
    setMessage(
      "auditTrailMessage",
      e.shortMessage || e.reason || e.message || "Gagal memuat audit trail.",
      "error",
    );
  } finally {
    button.disabled = false;
  }
}

function setMessage(id, text, type = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = text;
  element.className = type ? `message ${type}` : "message";
}

async function updateRole(enabled) {
  if (!donation || !account) {
    toast("Hubungkan wallet terlebih dahulu.");
    return;
  }

  const address = $("roleAddress").value.trim();
  const selectedRole = $("roleSelect").value;

  if (!ethers.isAddress(address)) {
    $("roleMessage").textContent = "Alamat wallet tidak valid.";
    $("roleMessage").className = "message error";
    return;
  }

  try {
    $("grantRoleBtn").disabled = true;
    $("revokeRoleBtn").disabled = true;

    $("roleMessage").textContent =
      "Periksa transaksi dan konfirmasi melalui MetaMask.";
    $("roleMessage").className = "message";

    const methods = {
      amil: "setAmil",
      volunteer: "setVolunteer",
      auditor: "setAuditor",
      regulator: "setRegulator",
    };

    const method = methods[selectedRole];

    const tx = await donation[method](address, enabled);

    $("roleMessage").textContent = "Transaksi dikirim. Menunggu konfirmasi...";
    await tx.wait();

    // Baca ulang role setelah transaksi berhasil.
    const role = await detectRole(account);
    $("activeRole").textContent = `Role: ${role}`;
    updateRolePanels(role);

    $("roleMessage").textContent = `${
      enabled ? "Role berhasil diberikan." : "Role berhasil dicabut."
    } Transaksi: ${tx.hash}`;
    $("roleMessage").className = "message success";

    toast(enabled ? "Role berhasil diberikan." : "Role berhasil dicabut.");
  } catch (e) {
    console.error(e);

    const errorMessage =
      e.shortMessage || e.reason || e.message || "Gagal mengatur role.";

    $("roleMessage").textContent = errorMessage;
    $("roleMessage").className = "message error";
  } finally {
    const adminAddress = donation ? await donation.admin().catch(() => "") : "";

    const isAdmin =
      account &&
      adminAddress &&
      adminAddress.toLowerCase() === account.toLowerCase();

    $("grantRoleBtn").disabled = !isAdmin;
    $("revokeRoleBtn").disabled = !isAdmin;
  }
}

const ready = () =>
  ethers.isAddress(CONFIG.tokenAddress) &&
  ethers.isAddress(CONFIG.donationAddress);
const fmt = (v) =>
  Number(ethers.formatUnits(v, 18)).toLocaleString("id-ID", {
    maximumFractionDigits: 4,
  });
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3800);
}

function message(msg, type = "") {
  const el = $("transactionMessage");

  if (!el) return;

  el.textContent = msg;
  el.className = "message " + type;
}

function busy(on) {
  $("connectBtn").disabled = on;
  $("refreshBtn").disabled = on || !account;

  const submitDonationBtn = $("submitDonationBtn");
  if (submitDonationBtn) {
    submitDonationBtn.disabled = on || !account;
  }
}
function activity(label, amount, status, hash) {
  const body = $("activityBody");
  if (body.querySelector(".empty")) body.innerHTML = "";
  const tr = document.createElement("tr");
  tr.dataset.hash = hash;
  tr.innerHTML = `<td><strong>${label}</strong><span class="sub">${new Date().toLocaleString(
    "id-ID",
  )}</span></td><td>${amount} DRT</td><td><span class="pill ${
    status === "Pending" ? "pending" : ""
  }">${status}</span></td><td><a class="hash" href="#" title="${hash}">${short(
    hash,
  )}</a></td>`;
  tr.querySelector("a").addEventListener("click", (e) => {
    e.preventDefault();
    navigator.clipboard?.writeText(hash).then(
      () => toast("Transaction hash disalin."),
      () => toast(hash),
    );
  });
  body.prepend(tr);
  $("activityCount").textContent = `${
    body.querySelectorAll("tr").length
  } aktivitas`;
}

function updateActivity(hash, status) {
  const tr = [...$("activityBody").querySelectorAll("tr")].find(
    (r) => r.dataset.hash === hash,
  );
  if (!tr) return;
  const p = tr.querySelector(".pill");
  p.textContent = status;
  p.classList.toggle("pending", status === "Pending");
}

async function connect() {
  if (!window.ethereum) {
    toast("MetaMask tidak ditemukan. Pasang ekstensi MetaMask.");
    return;
  }
  if (!ready()) {
    toast("Isi alamat kontrak di frontend/app.js terlebih dahulu.");
    return;
  }
  try {
    busy(true);
    await window.ethereum.request({ method: "eth_requestAccounts" });
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CONFIG.chainId) {
      account = null;
      $("walletStatus").textContent = "Wrong network";
      $("walletTitle").textContent = "Jaringan tidak sesuai";
      $("walletDescription").textContent =
        "Pilih Hardhat Local, RPC http://127.0.0.1:8545, Chain ID 31337.";
      $("walletAddress").textContent = `Chain ID: ${net.chainId}`;
      toast("Pilih jaringan Hardhat Local (31337) di MetaMask.");
      return;
    }

    account = await signer.getAddress();

    token = new ethers.Contract(CONFIG.tokenAddress, TOKEN_ABI, signer);

    donation = new ethers.Contract(
      CONFIG.donationAddress,
      DONATION_ABI,
      signer,
    );

    const role = await detectRole(account);
    $("activeRole").textContent = `Role: ${role}`;
    updateRolePanels(role);

    const adminAddress = await donation.admin();
    const isAdmin = adminAddress.toLowerCase() === account.toLowerCase();

    $("roleManagement").style.display = isAdmin ? "" : "none";

    $("grantRoleBtn").disabled = !isAdmin;
    $("revokeRoleBtn").disabled = !isAdmin;

    $("roleMessage").textContent = isAdmin
      ? "Wallet Admin terhubung. Pengaturan role siap digunakan."
      : "Hubungkan wallet Admin untuk mengatur role.";
    $("roleMessage").className = "message";

    console.log("Wallet aktif:", account);
    console.log("Role aktif:", role);
    $("connectBtn").textContent = `✓ ${short(account)}`;
    $("walletTitle").textContent = "Wallet berhasil terhubung";
    $("walletDescription").textContent =
      "MetaMask siap membaca data dan mengirim transaksi.";
    $("walletStatus").textContent = "Connected";
    $("walletAddress").textContent = account;
    message(
      "Wallet terhubung. Approve token sebelum melakukan donasi.",
      "success",
    );
    await refresh();
    toast("Wallet berhasil terhubung.");
  } catch (e) {
    console.error(e);
    toast(e.shortMessage || e.message || "Gagal menghubungkan wallet");
  } finally {
    busy(false);
  }
}

async function refresh() {
  if (!token || !donation || !account) return;

  try {
    const [bal, eth, next] = await Promise.all([
      token.balanceOf(account),
      provider.getBalance(account),
      donation.nextDonationId(),
    ]);

    $("statBalance").innerHTML = `${fmt(bal)} <small>DRT</small>`;

    $("ethBalance").textContent = `ETH untuk gas: ${Number(
      ethers.formatEther(eth),
    ).toLocaleString("id-ID", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} ETH`;

    let total = 0n;
    let allocated = 0n;
    let disbursed = 0n;

    // ID donasi dimulai dari 1; nextDonationId adalah ID berikutnya.
    for (let id = 1; id < Number(next); id++) {
      const d = await donation.getDonation(id);

      if (d.exists) {
        total += d.amount;
        allocated += d.allocatedAmount;
        disbursed += d.disbursedAmount;
      }
    }

    $("statDonation").innerHTML = `${fmt(total)} <small>DRT</small>`;

    $("statAllocated").innerHTML = `${fmt(allocated)} <small>DRT</small>`;

    $("statDisbursed").innerHTML = `${fmt(disbursed)} <small>DRT</small>`;

    $("donationStatFoot").textContent = `${Number(next) - 1} donasi tercatat`;
  } catch (e) {
    console.error(e);
    message(
      "Gagal membaca kontrak. Periksa ABI, alamat kontrak, dan pastikan Hardhat node aktif.",
      "error",
    );
  }
}

function amountInput() {
  const s = $("donationAmount").value.trim();
  if (!s || !Number.isFinite(Number(s)) || Number(s) <= 0)
    throw Error("Masukkan jumlah DRT lebih besar dari 0.");
  return ethers.parseUnits(s, 18);
}

async function approve() {
  if (!token || !donation) return;

  try {
    const raw = $("donationAmount").value;
    const amt = amountInput();

    // Validasi sebelum membuka MetaMask
    if (amt <= 0n) {
      throw Error("Masukkan jumlah DRT lebih besar dari 0.");
    }

    busy(true);

    message("Menunggu persetujuan approve di MetaMask…");

    const tx = await token.approve(CONFIG.donationAddress, amt);

    activity("Approve token", raw, "Pending", tx.hash);
    message(`Approve dikirim: ${short(tx.hash)}. Menunggu konfirmasi…`);

    await tx.wait();

    updateActivity(tx.hash, "Berhasil");
    message("Approve berhasil. Sekarang lakukan donasi.", "success");
    toast("Approve token berhasil");
  } catch (e) {
    console.error(e);

    const errorMessage =
      e.shortMessage || e.reason || e.message || "Approve gagal.";

    message(errorMessage, "error");

    // Toast kegagalan hanya untuk proses transaksi,
    // bukan untuk validasi nominal.
    if (!errorMessage.includes("Masukkan jumlah DRT lebih besar dari 0.")) {
      toast("Approve gagal atau dibatalkan");
    }
  } finally {
    busy(false);

    if (account) {
      $("approveBtn").disabled = false;
      $("donateBtn").disabled = false;
    }

    await refresh();
  }
}

async function donate() {
  if (!token || !donation) return;
  try {
    const raw = $("donationAmount").value;
    const amt = amountInput();

    if (amt <= 0n) {
      throw Error("Masukkan jumlah DRT lebih besar dari 0.");
    }

    busy(true);

    const [bal, allow] = await Promise.all([
      token.balanceOf(account),
      token.allowance(account, CONFIG.donationAddress),
    ]);
    if (bal < amt)
      throw Error(
        "Saldo DRT tidak cukup. Pilih akun lokal yang memiliki token DRT.",
      );
    if (allow < amt)
      throw Error("Allowance belum cukup. Klik Approve token terlebih dahulu.");
    message("Menunggu konfirmasi transaksi donasi di MetaMask…");
    const tx = await donation.donate(amt);
    activity("Donasi masuk", raw, "Pending", tx.hash);
    message(`Transaksi dikirim: ${short(tx.hash)}. Menunggu konfirmasi…`);
    const receipt = await tx.wait();
    updateActivity(tx.hash, "Berhasil");
    let id = "tercatat";
    for (const log of receipt.logs) {
      try {
        const ev = donation.interface.parseLog(log);
        if (ev?.name === "DonationReceived") {
          id = ev.args.donationId.toString();
          break;
        }
      } catch {}
    }
    message(
      `Donasi berhasil. Donation ID: ${id}. Tx: ${short(tx.hash)}`,
      "success",
    );
    toast("Donasi tercatat di blockchain.");
    await refresh();
  } catch (e) {
    console.error(e);
    message(
      e.shortMessage || e.reason || e.message || "Transaksi gagal.",
      "error",
    );
    toast(e.shortMessage || e.reason || e.message || "Donasi gagal.");
  } finally {
    busy(false);
    if (account) {
      $("approveBtn").disabled = false;
      $("donateBtn").disabled = false;
    }
  }
}

async function submitDisbursement() {
  if (!donation || !account) return;

  try {
    const allocationId = BigInt(
      document.getElementById("disbursementAllocationId").value,
    );

    const rawAmount = document
      .getElementById("disbursementAmount")
      .value.trim();

    const documentHash = document
      .getElementById("disbursementDocumentHash")
      .value.trim();

    if (allocationId < 1n) {
      throw new Error("ID alokasi harus minimal 1.");
    }

    if (!rawAmount || Number(rawAmount) <= 0) {
      throw new Error("Jumlah penyaluran harus lebih besar dari 0.");
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(documentHash)) {
      throw new Error(
        "Hash dokumen harus diawali 0x dan memiliki 64 karakter heksadesimal.",
      );
    }

    if (!(await donation.amils(account))) {
      throw new Error("Wallet yang terhubung bukan Amil.");
    }

    const amount = ethers.parseUnits(rawAmount, 18);

    const tx = await donation.requestDisbursement(
      allocationId,
      amount,
      documentHash,
    );

    document.getElementById("disbursementMessage").textContent =
      "Transaksi dikirim. Menunggu konfirmasi blockchain...";

    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error("Transaksi gagal di blockchain.");
    }

    document.getElementById("disbursementMessage").textContent =
      "Pengajuan penyaluran berhasil dicatat.";

    await loadAmilHistory();

    document.getElementById("disbursementAllocationId").value = "";
    document.getElementById("disbursementAmount").value = "";
    document.getElementById("disbursementDocumentHash").value = "";
  } catch (error) {
    console.error(error);

    document.getElementById("disbursementMessage").textContent =
      error.shortMessage || error.reason || error.message;
  }
}

async function processDisbursement(approveRequest) {
  if (!donation || !account) {
    toast("Hubungkan wallet terlebih dahulu.");
    return;
  }

  const messageEl = document.getElementById("auditorMessage");
  const approveBtn = document.getElementById("approveDisbursementBtn");
  const rejectBtn = document.getElementById("rejectDisbursementBtn");

  try {
    const rawId = document.getElementById("auditorRequestId").value.trim();

    if (!/^\d+$/.test(rawId) || BigInt(rawId) < 1n) {
      throw new Error("ID pengajuan harus berupa bilangan bulat minimal 1.");
    }

    if (!(await donation.auditors(account))) {
      throw new Error("Hanya Auditor yang dapat memproses pengajuan.");
    }

    const requestId = BigInt(rawId);

    // Baca ulang status untuk mencegah memproses pengajuan yang sudah selesai.
    const req = await donation.getDisbursement(requestId);

    if (Number(req.status) !== 0) {
      throw new Error("Pengajuan ini tidak lagi berstatus PENDING.");
    }

    let tx;

    approveBtn.disabled = true;
    rejectBtn.disabled = true;

    if (approveRequest) {
      messageEl.textContent = "Konfirmasikan persetujuan melalui MetaMask...";
      tx = await donation.approveDisbursement(requestId);
    } else {
      const reason = document.getElementById("rejectionReason").value.trim();

      if (!reason) {
        throw new Error("Masukkan alasan penolakan terlebih dahulu.");
      }

      // Hanya hash alasan yang dikirim ke blockchain.
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));

      messageEl.textContent = "Konfirmasikan penolakan melalui MetaMask...";
      tx = await donation.rejectDisbursement(requestId, reasonHash);
    }

    messageEl.textContent = `Transaksi ${tx.hash} dikirim. Menunggu konfirmasi...`;

    await tx.wait();

    messageEl.textContent = approveRequest
      ? "Pengajuan berhasil disetujui."
      : "Pengajuan berhasil ditolak.";

    messageEl.className = "message success";

    // Baca ulang data agar status terbaru tampil.
    await loadDisbursement();

    toast(approveRequest ? "Penyaluran disetujui." : "Pengajuan ditolak.");
  } catch (error) {
    console.error(error);

    messageEl.textContent =
      error.shortMessage || error.reason || error.message || "Transaksi gagal.";

    messageEl.className = "message error";
  } finally {
    // Tombol akan diaktifkan kembali oleh loadDisbursement()
    // hanya jika pengajuan masih PENDING.
    if (donation && account) {
      try {
        const isAuditor = await donation.auditors(account);

        if (isAuditor) {
          await loadDisbursement();
        } else {
          approveBtn.disabled = true;
          rejectBtn.disabled = true;
        }
      } catch (error) {
        console.error(error);
        approveBtn.disabled = true;
        rejectBtn.disabled = true;
      }
    }
  }
}

async function loadDisbursement() {
  if (!donation || !account) {
    toast("Hubungkan wallet terlebih dahulu.");
    return;
  }

  const messageEl = document.getElementById("auditorMessage");
  const detailsEl = document.getElementById("auditorRequestDetails");
  const approveBtn = document.getElementById("approveDisbursementBtn");
  const rejectBtn = document.getElementById("rejectDisbursementBtn");

  try {
    const rawId = document.getElementById("auditorRequestId").value.trim();

    if (!/^\d+$/.test(rawId) || BigInt(rawId) < 1n) {
      throw new Error("ID pengajuan harus berupa bilangan bulat minimal 1.");
    }

    if (!(await donation.auditors(account))) {
      throw new Error("Wallet yang terhubung bukan Auditor.");
    }

    messageEl.textContent = "Membaca pengajuan dari blockchain...";
    approveBtn.disabled = true;
    rejectBtn.disabled = true;

    const requestId = BigInt(rawId);
    const req = await donation.getDisbursement(requestId);
    const status = Number(req.status);

    const statusText = {
      0: "PENDING — menunggu pemeriksaan",
      1: "APPROVED — disetujui",
      2: "REJECTED — ditolak",
    };

    const details = [
      ["ID pengajuan", requestId.toString()],
      ["ID alokasi", req.allocationId.toString()],
      ["Jumlah penyaluran", `${ethers.formatUnits(req.amount, 18)} DRT`],
      ["Hash dokumen", req.documentHash],
      ["Status", statusText[status] ?? `Status ${status}`],
      ["Hash alasan penolakan", req.rejectionReasonHash],
    ];

    detailsEl.replaceChildren();

    for (const [label, value] of details) {
      const row = document.createElement("div");
      const labelEl = document.createElement("span");
      const valueEl = document.createElement("b");

      labelEl.textContent = label;
      valueEl.textContent = value;

      row.append(labelEl, valueEl);
      detailsEl.appendChild(row);
    }

    const isPending = status === 0;

    approveBtn.disabled = !isPending;
    rejectBtn.disabled = !isPending;

    messageEl.textContent = isPending
      ? "Pengajuan ditemukan dan menunggu keputusan Auditor."
      : "Pengajuan sudah diproses. Tombol keputusan dinonaktifkan.";

    messageEl.className = isPending ? "message success" : "message";
  } catch (error) {
    console.error(error);

    detailsEl.replaceChildren();
    messageEl.textContent =
      error.shortMessage ||
      error.reason ||
      error.message ||
      "Gagal membaca pengajuan.";
    messageEl.className = "message error";

    approveBtn.disabled = true;
    rejectBtn.disabled = true;
  }
}

async function loadAmilHistory() {
  const list = document.getElementById("amilHistoryList");
  const message = document.getElementById("amilHistoryMessage");

  list.innerHTML = "";
  message.textContent = "Memuat riwayat...";

  try {
    const nextId = Number(await donation.nextDisbursementId());

    for (let id = 1; id < nextId; id++) {
      const d = await donation.getDisbursement(id);

      if (!d[4]) continue;

      const statusMap = {
        0: "PENDING",
        1: "APPROVED",
        2: "REJECTED",
      };

      const item = document.createElement("div");
      item.style.padding = "16px";
      item.style.border = "1px solid #e5e7eb";
      item.style.borderRadius = "12px";
      item.style.background = "#fff";
      item.style.boxSizing = "border-box";

      const title = document.createElement("strong");
      title.textContent = `Pengajuan #${id} — ${
        statusMap[Number(d[3])] ?? "UNKNOWN"
      }`;

      const details = document.createElement("p");
      details.textContent = `ID alokasi: ${d[0]} | Jumlah: ${ethers.formatUnits(
        d[1],
        18,
      )} DRT`;

      item.append(title, details);
      list.appendChild(item);
    }

    message.textContent = list.children.length
      ? ""
      : "Belum ada riwayat pengajuan.";
  } catch (error) {
    console.error(error);
    message.textContent = "Gagal memuat riwayat pengajuan.";
  }
}

async function verifyRecipient() {
  const message = document.getElementById("verifyRecipientMessage");
  const hash = document.getElementById("verifyRecipientHash").value.trim();
  const button = document.getElementById("verifyRecipientBtn");

  if (!donation || !account) {
    message.textContent = "Hubungkan wallet Amil terlebih dahulu.";
    return;
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    message.textContent = "Hash penerima harus berupa bytes32.";
    return;
  }

  try {
    button.disabled = true;
    message.textContent = "Memeriksa status penerima...";

    const recipient = await donation.getRecipient(hash);

    if (!recipient.exists) {
      message.textContent = "Penerima tidak ditemukan.";
      return;
    }

    if (recipient.amilVerified) {
      message.textContent = "Penerima sudah diverifikasi Amil.";
      return;
    }

    message.textContent = "Periksa dan konfirmasi transaksi melalui MetaMask.";

    const tx = await donation.verifyRecipient(hash);
    message.textContent = "Transaksi dikirim. Menunggu konfirmasi...";

    await tx.wait();

    message.textContent = "Penerima berhasil diverifikasi oleh Amil.";
  } catch (error) {
    console.error(error);
    message.textContent =
      error.reason || error.shortMessage || "Verifikasi gagal.";
  } finally {
    button.disabled = false;
  }
}

async function createAllocation() {
  const message = document.getElementById("createAllocationMessage");

  try {
    const donationId = document
      .getElementById("allocationDonationId")
      .value.trim();
    const recipientHash = document
      .getElementById("allocationRecipientHash")
      .value.trim();
    const amount = document.getElementById("allocationAmount").value.trim();

    if (!donationId || !recipientHash || !amount || Number(amount) <= 0) {
      message.textContent = "Lengkapi semua input dengan nilai yang valid.";
      return;
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(recipientHash)) {
      message.textContent =
        "Hash penerima harus berupa bytes32 (0x diikuti 64 digit heksadesimal).";
      return;
    }

    message.textContent = "Menunggu konfirmasi MetaMask...";

    const amountWei = ethers.parseUnits(amount, 18);
    const tx = await donation.allocateDonation(
      BigInt(donationId),
      recipientHash,
      amountWei,
    );

    message.textContent = "Transaksi sedang diproses...";
    await tx.wait();

    message.textContent = "Alokasi berhasil dibuat.";
    document.getElementById("allocationDonationId").value = "";
    document.getElementById("allocationRecipientHash").value = "";
    document.getElementById("allocationAmount").value = "";

    await refresh();
    await loadAllocations();
  } catch (error) {
    console.error(error);
    message.textContent =
      error.reason ||
      error.shortMessage ||
      "Alokasi gagal. Periksa role Amil, ID donasi, verifikasi penerima, dan saldo donasi.";
  }
}

async function loadAllocations() {
  const list = document.getElementById("allocationList");
  const message = document.getElementById("allocationMessage");

  list.innerHTML = "";
  message.textContent = "Memuat alokasi...";

  try {
    const nextId = Number(await donation.nextAllocationId());

    for (let id = 1; id < nextId; id++) {
      let a;

      try {
        a = await donation.getAllocation(id);
      } catch {
        continue;
      }

      if (!a[5]) continue;

      const card = document.createElement("div");
      card.style.cssText =
        "padding:16px;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:12px;";

      const title = document.createElement("strong");
      title.textContent = `Alokasi #${id}`;

      const details = document.createElement("p");
      details.textContent =
        `ID Donasi: ${a[0]} | Total: ${ethers.formatUnits(a[2], 18)} DRT | ` +
        `Sudah disalurkan: ${ethers.formatUnits(a[3], 18)} DRT | ` +
        `Cadangan: ${ethers.formatUnits(a[4], 18)} DRT`;

      card.append(title, details);
      list.appendChild(card);
    }

    message.textContent = list.children.length ? "" : "Belum ada alokasi dana.";
  } catch (error) {
    console.error(error);
    message.textContent = "Gagal memuat alokasi. Periksa ABI kontrak.";
  }
}

async function submitRecipient() {
  const message = document.getElementById("recipientMessage");

  try {
    const name = document.getElementById("recipientName").value.trim();
    const wallet = document.getElementById("recipientWallet").value.trim();
    const documentHash = document
      .getElementById("recipientDocumentHash")
      .value.trim();

    if (!name || !wallet || !documentHash) {
      message.textContent = "Lengkapi semua input.";
      return;
    }

    if (!ethers.isAddress(wallet)) {
      message.textContent = "Alamat wallet tidak valid.";
      return;
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(documentHash)) {
      message.textContent = "Hash dokumen harus berupa bytes32.";
      return;
    }

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes(name));

    message.textContent = `Hash penerima: ${recipientHash}. Menunggu konfirmasi...`;

    const tx = await donation.submitRecipient(
      recipientHash,
      wallet,
      documentHash,
    );

    await tx.wait();

    message.textContent = `Penerima berhasil didaftarkan. Hash: ${recipientHash}`;
  } catch (error) {
    console.error(error);
    message.textContent =
      error.reason || error.shortMessage || "Pendaftaran penerima gagal.";
  }
}

async function approveRecipient() {
  const message = document.getElementById("approveRecipientMessage");
  const hash = document.getElementById("approveRecipientHash").value.trim();
  const button = document.getElementById("approveRecipientBtn");

  if (!donation || !account) {
    message.textContent = "Hubungkan wallet Auditor terlebih dahulu.";
    return;
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    message.textContent = "Hash penerima harus berupa bytes32.";
    return;
  }

  try {
    button.disabled = true;
    message.textContent = "Memeriksa status penerima...";

    const recipient = await donation.getRecipient(hash);

    if (!recipient.exists) {
      message.textContent = "Penerima tidak ditemukan.";
      return;
    }

    if (!recipient.amilVerified) {
      message.textContent = "Penerima harus diverifikasi Amil terlebih dahulu.";
      return;
    }

    if (recipient.auditorVerified) {
      message.textContent = "Penerima sudah disetujui Auditor.";
      return;
    }

    message.textContent = "Periksa dan konfirmasi transaksi melalui MetaMask.";

    const tx = await donation.approveRecipient(hash);
    message.textContent = "Transaksi dikirim. Menunggu konfirmasi...";

    await tx.wait();

    message.textContent = "Penerima berhasil disetujui oleh Auditor.";
  } catch (error) {
    console.error(error);
    message.textContent =
      error.reason || error.shortMessage || "Persetujuan gagal.";
  } finally {
    button.disabled = false;
  }
}

function init() {
  updateRolePanels("");
  $("today").textContent =
    "◷  " +
    new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  $("tokenAddress").textContent = ready()
    ? short(CONFIG.tokenAddress)
    : "Belum diatur";
  $("donationAddress").textContent = ready()
    ? short(CONFIG.donationAddress)
    : "Belum diatur";
  $("connectBtn").addEventListener("click", connect);
  $("refreshBtn").addEventListener("click", refresh);
  if (!ready())
    message(
      "Isi alamat kontrak di frontend/app.js sebelum menghubungkan MetaMask.",
    );
  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", () => location.reload());
    window.ethereum.on?.("chainChanged", () => location.reload());
  }
  $("grantRoleBtn").addEventListener("click", () => {
    updateRole(true);
  });

  $("revokeRoleBtn").addEventListener("click", () => {
    updateRole(false);
  });

  $("loadAuditTrailBtn").addEventListener("click", loadAuditTrail);

  $("submitDonationBtn").addEventListener("click", submitDonation);
  $("loadDonorHistoryBtn").addEventListener("click", loadDonorHistory);

  document
    .getElementById("submitDisbursementBtn")
    .addEventListener("click", submitDisbursement);

  document
    .getElementById("loadDisbursementBtn")
    .addEventListener("click", loadDisbursement);

  document
    .getElementById("approveDisbursementBtn")
    .addEventListener("click", () => processDisbursement(true));

  document
    .getElementById("rejectDisbursementBtn")
    .addEventListener("click", () => processDisbursement(false));

  document
    .getElementById("loadAmilHistoryBtn")
    .addEventListener("click", loadAmilHistory);

  document
    .getElementById("loadAllocationsBtn")
    .addEventListener("click", loadAllocations);

  document
    .getElementById("createAllocationBtn")
    .addEventListener("click", createAllocation);

  document
    .getElementById("submitRecipientBtn")
    .addEventListener("click", submitRecipient);

  document
    .getElementById("verifyRecipientBtn")
    .addEventListener("click", verifyRecipient);

  document
    .getElementById("approveRecipientBtn")
    .addEventListener("click", approveRecipient);
}
document.addEventListener("DOMContentLoaded", init);
