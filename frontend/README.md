# Frontend

This folder contains the Vite React frontend for the Django backend.

## Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:5173`

## Notes

- Uses Tailwind CSS via CDN only.
- Uses Axios with `VITE_API_BASE_URL` from `.env`.
- Auth endpoints:
  - `/token/` for login
  - `/api/register/` for register
  - `/api/logout/` for logout
  - `/api/google/` for Google login
  - `/api/dashboard/` for protected dashboard data
