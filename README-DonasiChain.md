# DonasiChain — Panduan Menjalankan dan Menguji Project

Panduan ini ditujukan untuk anggota tim yang ingin menjalankan DonasiChain secara lokal, menghubungkan MetaMask, dan menguji fitur berdasarkan role pengguna.

## 1. Struktur Project

```text
uas-blockchain/
├── artifacts/
├── cache/
├── contracts/
│   ├── DisasterDonation.sol
│   └── MockToken.sol
├── evidence/
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── scripts/
│   ├── client-demo.js
│   ├── deploy-demo.js
│   ├── fund-donor.js
│   └── verify-donation.js
├── test/
│   └── DisasterDonation.js
├── hardhat.config.ts
├── package.json
└── README.md
```

## 2. Prasyarat

Pastikan sudah terpasang:

- Node.js dan npm
- Git
- MetaMask pada browser
- VS Code

Clone repository:

```bash
git clone https://github.com/ririn-rahmaa/uas-blockchain.git
cd uas-blockchain
npm install
```

Periksa versi perangkat:

```bash
node -v
npm -v
npx hardhat --version
```

## 3. Menjalankan Blockchain Lokal

Buka terminal pertama di folder `uas-blockchain`:

```bash
npx hardhat node
```

Biarkan terminal ini tetap berjalan. Hardhat akan menyediakan blockchain lokal untuk transaksi pengujian.

Akun yang disediakan Hardhat memiliki saldo ETH lokal untuk membayar gas. Akun tersebut hanya untuk pengujian, bukan wallet sungguhan.

## 4. Deploy Smart Contract

Buka terminal kedua di folder utama proyek.

Kompilasi kontrak:

```bash
npx hardhat compile
```

Jalankan script deployment yang tersedia:

```bash
npx hardhat run scripts/deploy-demo.js --network localhost
```

Jika perintah tersebut tidak sesuai dengan konfigurasi Hardhat 3 pada repositori, periksa `hardhat.config.ts` dan petunjuk deployment di `scripts/deploy-demo.js`.

Catat alamat kontrak `MockToken` dan `DisasterDonation` dari output deployment.

**Penting:** setiap kali blockchain lokal di-reset dan kontrak di-deploy ulang, alamat kontrak dapat berubah. Perbarui alamat kontrak pada `frontend/app.js` agar sesuai dengan deployment terbaru.

## 5. Konfigurasi Frontend

Buka:

```text
frontend/app.js
```

Periksa konfigurasi berikut:

- Alamat kontrak token (`tokenAddress`).
- Alamat kontrak donasi (`donationAddress`).
- Chain ID `31337`.
- ABI kontrak yang digunakan frontend.

Pastikan alamat dan ABI sesuai dengan kontrak hasil deployment.

## 6. Menjalankan Frontend

Buka folder `frontend` pada VS Code.

Jalankan `index.html` menggunakan ekstensi **Live Server**:

1. Klik kanan `frontend/index.html`.
2. Pilih **Open with Live Server**.
3. Buka alamat lokal yang muncul di browser.

Frontend harus dijalankan melalui server lokal, bukan dengan membuka file HTML secara langsung.

## 7. Menghubungkan MetaMask

### Menambahkan jaringan Hardhat Local

Pada MetaMask, tambahkan jaringan dengan konfigurasi:

| Pengaturan      | Nilai                   |
| --------------- | ----------------------- |
| Network Name    | Hardhat Local           |
| RPC URL         | `http://127.0.0.1:8545` |
| Chain ID        | `31337`                 |
| Currency Symbol | ETH                     |

Simpan dan pilih jaringan tersebut.

### Mengimpor akun pengujian

1. Salin private key salah satu akun yang ditampilkan oleh terminal `npx hardhat node`.
2. Pada MetaMask, pilih **Import account**.
3. Masukkan private key akun lokal tersebut.
4. Pastikan jaringan yang dipilih adalah Hardhat Local.

Jangan pernah menggunakan atau membagikan private key wallet sungguhan untuk pengujian ini.

### Menghubungkan wallet ke aplikasi

1. Buka frontend DonasiChain.
2. Klik tombol koneksi MetaMask.
3. Pilih akun yang akan digunakan.
4. Konfirmasi permintaan koneksi.
5. Periksa alamat wallet dan role yang ditampilkan aplikasi.

## 8. Menyiapkan Akun dan Role

DonasiChain memiliki role berikut:

| Role      | Hak akses utama                                |
| --------- | ---------------------------------------------- |
| Admin     | Mengatur role pengguna                         |
| Donatur   | Memberikan donasi dan melihat riwayat          |
| Volunteer | Mendaftarkan calon penerima manfaat            |
| Amil      | Memverifikasi penerima dan mengalokasikan dana |
| Auditor   | Menyetujui atau menolak penyaluran             |
| Regulator | Melihat audit trail                            |

Admin adalah alamat yang ditentukan oleh smart contract. Gunakan akun Admin untuk memberikan role kepada akun pengujian lain melalui panel pengaturan role.

Akun Donatur tidak memerlukan role khusus. Gunakan akun yang belum diberi role untuk menguji fitur donasi.

## 9. Skenario Pengujian yang bisa dilakukan

### A. Donatur

1. Hubungkan akun tanpa role khusus.
2. Pastikan panel Donatur tampil.
3. Masukkan nominal donasi, misalnya `10 DRT`.
4. Jika diminta, setujui penggunaan token ERC-20.
5. Konfirmasi transaksi donasi di MetaMask.
6. Tunggu transaksi berhasil.
7. Muat riwayat donasi dan pastikan transaksi tercatat.

### B. Volunteer

1. Hubungkan akun dengan role Volunteer.
2. Isi data pendaftaran penerima sesuai form.
3. Masukkan wallet penerima dan hash dokumen.
4. Kirim transaksi pendaftaran.
5. Pastikan transaksi berhasil.

### C. Amil

1. Hubungkan akun dengan role Amil.
2. Masukkan hash penerima yang sudah didaftarkan.
3. Lakukan verifikasi penerima sesuai alur aplikasi.
4. Lakukan alokasi dana jika persyaratan penerima telah terpenuhi.
5. Periksa nominal dan status alokasi.

### D. Auditor

1. Hubungkan akun dengan role Auditor.
2. Lakukan persetujuan penerima sesuai alur aplikasi.
3. Periksa pengajuan penyaluran yang tersedia.
4. Uji persetujuan atau penolakan pengajuan.
5. Jika disetujui, pastikan transaksi berhasil dan saldo token penerima berubah.

### E. Regulator

1. Hubungkan akun dengan role Regulator.
2. Buka panel Audit Trail.
3. Klik **Muat Riwayat Blockchain**.
4. Periksa aktivitas, detail transaksi, status, blok, dan transaction hash.

## 10. Menjalankan Pengujian Otomatis (tidak detail)

File pengujian tersedia di:

```text
test/DisasterDonation.js
```

Jalankan:

```bash
npx hardhat test
```

Perintah tersebut menjalankan test yang dikenali oleh konfigurasi Hardhat. Jika terjadi error, periksa konfigurasi test dan dependensi pada `hardhat.config.ts`.

## 11. Troubleshooting

**MetaMask tidak ditemukan**

- Pastikan ekstensi MetaMask aktif.

**Wrong network**

- Pilih Hardhat Local dengan Chain ID `31337`.

**Alamat kontrak tidak sesuai**

- Periksa hasil deployment dan konfigurasi `frontend/app.js`.

**Insufficient funds**

- Pastikan akun memiliki ETH lokal untuk gas dan token DRT untuk donasi.

**Transaksi gagal**

- Periksa role akun, saldo token, allowance, status penerima, serta jumlah alokasi dan penyaluran.

**Panel tidak muncul**

- Periksa role akun yang terdeteksi dan atribut pembatasan panel di frontend.

**Kontrak tidak merespons setelah node dimulai ulang**

- Pastikan deployment aktif dan alamat kontrak pada frontend masih benar.

## 12. Menghentikan Pengujian

- Hentikan Live Server.
- Pada terminal Hardhat, tekan `Ctrl + C`.
- Tutup sesi pengujian MetaMask jika sudah selesai.

Seluruh transaksi dan token pada Hardhat Local adalah data pengujian, bukan transaksi pada jaringan blockchain publik.
