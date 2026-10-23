# Blockchain Donation & Disbursement Prototype

Prototipe smart contract untuk pencatatan donasi dan penyaluran bantuan berbasis blockchain. Sistem mengatur penerimaan donasi, verifikasi penerima, alokasi dana, serta persetujuan pencairan melalui pembagian hak akses.

## 1. Teknologi

- Solidity `0.8.34`
- Hardhat `3.21.0`
- OpenZeppelin `5.6.1`
- JavaScript, Mocha, dan Chai untuk unit testing
- ERC-20 untuk representasi token donasi dalam simulasi
- Local blockchain untuk pengujian dan demonstrasi

## 2. Fitur Utama

- Penerimaan donasi menggunakan token ERC-20.
- Pendaftaran dan verifikasi penerima bantuan.
- Alokasi donasi kepada penerima terverifikasi.
- Pengajuan pencairan oleh amil.
- Persetujuan atau penolakan pencairan oleh auditor.
- Pembatasan fungsi berdasarkan role.
- Pencatatan aktivitas penting melalui event.
- Validasi nominal, ketersediaan dana, dan status transaksi.
- Pencegahan pencairan ganda pada pengajuan yang sama.

## 3. Smart Contract

### `MockToken.sol`

Token ERC-20 untuk simulasi donasi. Kontrak mencetak token awal kepada pemilik saat deployment dan membatasi fungsi pencetakan tambahan berdasarkan kepemilikan.

### `DisasterDonation.sol`

Kontrak utama yang mengelola alur donasi dan penyaluran bantuan. Kontrak menggunakan struktur data `Donation`, `Recipient`, `Allocation`, dan `Disbursement`, serta enumerasi status donasi dan pencairan.

Komponen OpenZeppelin yang digunakan meliputi:

- `ERC20` dan `Ownable` untuk token simulasi.
- `IERC20` sebagai interface token.
- `SafeERC20` untuk operasi transfer token.
- `ReentrancyGuard` untuk perlindungan terhadap reentrancy pada fungsi yang menggunakannya.

## 4. Alur Transaksi

1. Donatur memberikan persetujuan token dan melakukan donasi.
2. Relawan mendaftarkan calon penerima.
3. Amil memverifikasi penerima.
4. Auditor menyetujui penerima.
5. Amil mengalokasikan dana kepada penerima.
6. Amil mengajukan pencairan.
7. Auditor menyetujui atau menolak pencairan.
8. Jika disetujui, token ditransfer kepada penerima. Jika ditolak, reservasi dana dilepas.

Status donasi yang digunakan adalah `RECEIVED`, `ALLOCATED`, dan `DISBURSED`. Status pencairan adalah `PENDING`, `APPROVED`, dan `REJECTED`.

## 5. Struktur Proyek

```text
uas-blockchain/
├── contracts/
│   ├── MockToken.sol
│   └── DisasterDonation.sol
├── scripts/
│   └── deploy-demo.js
├── test/
│   └── DisasterDonation.js
├── hardhat.config.js
├── package.json
└── README.md
```

## 6. Instalasi

Pastikan Node.js dan npm sudah terpasang.
```bash
npm install
```

Kompilasi Smart Contract
```bash
npx hardhat compile
```

Menjalankan Blockchain Lokal

Buka terminal pertama:
```bash
npx hardhat node
```
Blockchain lokal berjalan pada endpoint http://127.0.0.1:8545

Menjalankan Script Demo

Buka terminal kedua, lalu jalankan:
```bash
npx hardhat run scripts/deploy-demo.js --network localhost
```
Perintah ini digunakan untuk menjalankan demo deployment dan alur transaksi pada jaringan lokal, jika konfigurasi Hardhat mendukung network localhost tersebut.

## 7. Menjalankan Unit Test

Jalankan seluruh unit test dengan:

```bash
npx hardhat test
```

Pengujian yang telah dilakukan mencakup 12 skenario, meliputi:

- Penerimaan donasi.
- Penolakan alokasi melebihi dana tersedia.
- Pembatasan akses auditor.
- Penolakan pencairan dan pelepasan reservasi.
- Transfer token kepada penerima.
- Validasi penerima terverifikasi.
- Validasi nominal nol.
- Pencegahan pencairan ganda.
- Pencairan sebagian dan penuh.
- Pengajuan ulang setelah pencairan sebelumnya ditolak.

**Hasil pengujian terakhir yang dilaporkan:** `12 passing`.

Jalankan kembali pengujian setelah perubahan kode untuk memastikan hasil tersebut masih berlaku.

## 8. Demo Deployment Lokal

Proyek menggunakan script `scripts/deploy-demo.js` untuk mendemonstrasikan alur donasi dan pencairan pada blockchain lokal.

Konfigurasi jaringan lokal menggunakan endpoint:

```text
http://127.0.0.1:8545
```

## 9. Event dan Verifikasi

Event antara lain `DonationReceived` dan `DisbursementApproved`.

Event dapat diperiksa melalui transaction receipt untuk membantu memverifikasi aktivitas kontrak. Perubahan status dan saldo token juga dapat digunakan sebagai bukti hasil transaksi.

## 10. Batasan Prototipe

- Token yang digunakan merupakan token simulasi, bukan uang nyata.
- Deployment yang dibahas dilakukan pada blockchain lokal.
- Alamat kontrak dan transaction hash bergantung pada hasil deployment masing-masing.
- Integrasi frontend/client dan penyimpanan data off-chain perlu dinilai berdasarkan implementasi aktual.

