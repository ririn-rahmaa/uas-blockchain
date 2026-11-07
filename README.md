**Gambaran Umum**

DonasiChain merupakan prototipe sistem donasi dan penyaluran bantuan bencana alam berbasis blockchain. Sistem ini menggunakan smart contract untuk mengelola penerimaan donasi, verifikasi penerima, alokasi dana, dan persetujuan penyaluran berdasarkan hak akses pengguna.

Prototipe menggunakan token ERC-20 simulasi dan blockchain lokal Hardhat untuk pengujian.

**Fitur Utama**

- Penerimaan donasi menggunakan token ERC-20.
- Pendaftaran dan verifikasi penerima bantuan.
- Alokasi dana kepada penerima terverifikasi.
- Pengajuan pencairan dana oleh amil.
- Persetujuan atau penolakan pencairan oleh auditor.
- Pembatasan akses berdasarkan role pengguna.
- Pencatatan aktivitas transaksi melalui event blockchain.
- Validasi nominal, ketersediaan dana, dan status transaksi
- Pencegahan pencarian ganda pada pengajuan yang sama

**Teknologi yang Digunakan**

| Teknologi          | Fungsi                               |
| ------------------ | ------------------------------------ |
| Solidity 0.8.34    | Pengembangan smart contract          |
| Hardhat 3.21.0     | Development dan pengujian blockchain |
| OpenZeppelin 5.6.1 | Library smart contract               |
| JavaScript         | Script deployment                    |
| Mocha dan Chai     | Unit testing                         |
| MetaMask           | Koneksi wallet                       |
| ERC-20             | Standar token donasi                 |

**Smart Contract**

### `MockToken.sol`

Smart contract token ERC-20 yang digunakan untuk simulasi donasi.

### `DisasterDonation.sol`

Smart contract utama yang mengelola penerimaan donasi, pendaftaran dan verifikasi penerima, alokasi dana, serta proses persetujuan dan pencairan bantuan.

**Alur Penggunaan Berdasarkan Role**

Setiap pengguna menghubungkan wallet MetaMask dan menggunakan akun yang sesuai dengan role-nya. Transaksi yang memerlukan perubahan data blockchain harus dikonfirmasi melalui MetaMask.

| Role      | Aktivitas                                                                         |
| --------- | --------------------------------------------------------------------------------- |
| Admin     | Mengatur role pengguna                                                            |
| Donatur   | Memberikan donasi melalui token DRT dan mengonfirmasi transaksi melalui MetaMask. |
| Volunteer | Mendaftarkan calon penerima bantuan.                                              |
| Amil      | Memverifikasi penerima, mengalokasikan dana, dan mengajukan pencairan.            |
| Auditor   | Menyetujui atau menolak penerima dan pengajuan pencairan.                         |
| Regulator | Melihat riwayat aktivitas dan audit trail blockchain.                             |

**Struktur Proyek**

uas-blockchain/  
├── artifacts/  
├── cache/  
├── contracts/  
│ ├── DisasterDonation.sol  
│ └── MockToken.sol  
├── evidence/  
├── frontend/  
│ ├── app.js  
│ ├── index.html  
│ └── style.css  
├── scripts/  
│ ├── deploy-demo.js  
│ ├── transfer-token.js  
│ └── verify-donation.js  
├── test/  
│ └── DisasterDonation.js  
├── types/  
├── .gitignore  
├── hardhat.config.ts  
├── package-lock.json  
├── package.json  
├── README-DonasiChain.md  
├── README.md  
└── tsconfig.json

## **Prasyarat**

Sebelum menjalankan DonasiChain, pastikan perangkat berikut sudah tersedia:

- Node.js dan npm
- Git
- MetaMask pada browser
- Visual Studio Code

**Instalasi**

Clone repository dan masuk ke direktori proyek:

`git clone https://github.com/ririn-rahmaa/uas-blockchain.git`

`cd uas-blockchain`

Instal seluruh dependency:

`npm install`

**Menjalankan blockchain local**

Buka terminal di direktori utama proyek, kemudian jalankan:

`npx hardhat node`

Hardhat akan menjalankan jaringan blockchain lokal pada:

[`http://127.0.0.1:8545`](http://127.0.0.1:8545)

Jaringan ini menggunakan Chain ID `31337` dan menyediakan akun pengujian beserta saldo ETH lokal.

Biarkan terminal tetap berjalan selama proses pengujian.

**Deployment Smart Contract**

Buka terminal kedua di direktori utama proyek, kemudian jalankan:

`npx hardhat run scripts/deploy-demo.js --network localhost`

Script tersebut menjalankan deployment dan demo transaksi pada jaringan Hardhat Local.

Catat alamat contract `MockToken` dan `DisasterDonation` serta transaction hash yang dihasilkan.

Catatan: alamat contract dapat berubah ketika jaringan lokal di-reset dan deployment dilakukan kembali.

**Pengujian otomatis**

Jalankan seluruh unit test dengan perintah:

`npx hardhat test`

File pengujian berada di:

`test/DisasterDonation.js`

Pengujian diantaranya meliputi validasi donasi, pembatasan akses berdasarkan role, alokasi dana, persetujuan pencairan, dan pencegahan pencairan ganda.

**Menjalankan proyek**

Buka terminal baru di direktori utama proyek, kemudian jalankan:

`npx serve frontend`

Perintah tersebut menjalankan frontend melalui server lokal. Buka alamat lokal yang ditampilkan pada terminal menggunakan browser.

**Konfigurasi MetaMask**

Tambahkan jaringan Hardhat Local pada MetaMask dengan konfigurasi berikut:

| Pengaturan      | Nilai                   |
| --------------- | ----------------------- |
| Network Name    | Hardhat Local           |
| RPC URL         | `http://127.0.0.1:8545` |
| Chain ID        | `31337`                 |
| Currency Symbol | ETH                     |

Untuk menggunakan akun pengujian:

1. Salin private key salah satu akun dari terminal Hardhat Local.
2. Buka MetaMask dan pilih Import Account.
3. Masukkan private key akun pengujian.
4. Pastikan jaringan yang dipilih adalah Hardhat Local.

Menghubungkan wallet ke aplikasi:

1. Buka frontend
2. Klik tombol MetaMak
3. Pilih akun yang akan digunakan
4. Konfirmasi permintaan koneksi
5. Periksa alamat wallet dan role yang ditampilkan aplikasi

**Transfer token**

Buka terminal baru di proyek:

jalankan script transfer token dari admin ke donatur, agar donatur bisa melakukan donasi:

`npx hardhat run scripts/transfer-token.js --network localhost`

**Hash Dokumen Pendukung**
`node scripts/hash-file.js "Dokumen pendukung penerima donasi.pdf"`

**Verifikasi transaksi**

jalankan script verify-donation, untuk memverifikasi transaksi:

`npx hardhat run scripts/verify-donation.js --network localhost`

**Troubleshooting**

| Masalah                     | Penanganan                                                                    |
| --------------------------- | ----------------------------------------------------------------------------- |
| MetaMask tidak terdeteksi   | Pastikan ekstensi MetaMask aktif.                                             |
| Wrong network               | Pilih jaringan Hardhat Local (Chain ID 31337).                                |
| Alamat kontrak tidak sesuai | Periksa hasil deployment dan konfigurasi alamat kontrak pada frontend.        |
| Insufficient funds          | Pastikan akun memiliki ETH lokal untuk gas dan token DRT untuk donasi.        |
| Transaksi gagal             | Periksa role, saldo token, allowance, status penerima, dan nominal transaksi. |
| Panel tidak muncul          | Periksa role akun yang terhubung.                                             |
| Kontrak tidak merespons     | Pastikan Hardhat Local berjalan dan kontrak sudah di-deploy.                  |

## **Batasan Prototipe**

- Token yang digunakan merupakan token simulasi, bukan uang nyata.
- Deployment dilakukan pada jaringan blockchain lokal Hardhat.
- Alamat smart contract dan transaction hash bergantung pada hasil deployment masing-masing.
