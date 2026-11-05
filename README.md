# BookNook Backend

Backend API for BookNook, a library management application. The server provides book discovery and management, authenticated borrowing and returning, and MongoDB-backed inventory tracking.

Live server: [https://booknook-backend-iota.vercel.app/](https://booknook-backend-iota.vercel.app/)

## Features

- Express REST API
- MongoDB persistence
- JWT verification through the frontend's JWKS endpoint
- Book creation, listing, updating, and deletion
- Available-copy tracking for borrowed books
- Borrow and return operations using MongoDB transactions
- New-arrivals and top-category endpoints
- CORS support for local and deployed frontends
- Vercel deployment configuration

## Tech stack

- Node.js
- Express 5
- MongoDB Node.js driver
- `jose` for JWT verification
- `dotenv` for environment configuration

## Project structure

```text
BookNook-A7-Backend/
├── index.js            # Express server, middleware, database connection, and API routes
├── package.json        # Project metadata, dependencies, and npm scripts
├── package-lock.json   # Locked dependency versions
├── vercel.json         # Vercel deployment configuration
├── .env                # Local environment variables (not committed)
├── .gitignore          # Files excluded from version control
└── README.md           # Project documentation
```

The MongoDB database is organized into the following collections:

```text
booknook-db1/
├── books              # Book information and available-copy counts
└── borrows            # Active borrowing records for users
```

## API endpoints

All responses are JSON unless noted otherwise.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | No | Health/welcome response |
| GET | `/books` | No | Get all books |
| GET | `/books/:id` | No | Get one book by MongoDB ID |
| GET | `/new-arrivals` | No | Get the six newest books |
| GET | `/top-categories` | No | Get the five categories with the most books |
| POST | `/add-book` | Yes | Add a book |
| GET | `/my-books` | Yes | Get books added by the authenticated user |
| PATCH | `/books/:id` | Yes | Update a book owned by the authenticated user |
| DELETE | `/books/:id` | Yes | Delete a book owned by the authenticated user |
| POST | `/borrows` | Yes | Borrow an available book |
| GET | `/borrows` | Yes | Get the authenticated user's active borrows |
| DELETE | `/borrows/:id` | Yes | Return a borrowed book |


## Requirements

- Node.js 18 or later
- A MongoDB database. MongoDB Atlas is recommended because borrow and return operations use transactions, which require a replica set or sharded cluster.
- A frontend that exposes a compatible JWKS endpoint at `/api/auth/jwks`

## Getting started

1. Clone the repository and enter the project directory.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:

   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
   FRONTEND_URL_LOCAL=http://localhost:3000
   FRONTEND_URL_VERCEL=https://your-frontend.vercel.app
   PORT=5000
   NODE_ENV=development
   ```

   `MONGODB_URI`, `FRONTEND_URL_LOCAL`, and `FRONTEND_URL_VERCEL` are required. `PORT` defaults to `5000` when omitted.

4. Start the server:

   ```bash
   node index.js
   ```

   The API will be available at `http://localhost:5000`.

## Database

The application uses the `booknook-db1` database and creates or uses these collections:

- `books`
- `borrows`

On startup, the server performs a small migration that adds `totalCopies` to older books, normalizes legacy borrow records, and creates a unique index on `{ bookId, userId }` to prevent duplicate active borrows.

## Authentication

Protected endpoints require a bearer token:

```http
Authorization: Bearer <jwt>
```

The JWT must contain a `sub` claim. The server obtains signing keys from:

```text
<active frontend URL>/api/auth/jwks
```

In production, `FRONTEND_URL_VERCEL` is used when `NODE_ENV=production`; otherwise `FRONTEND_URL_LOCAL` is used.


### Add a book

`POST /add-book`

Example request body:

```json
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "category": "Classic",
  "description": "A novel about ambition and the American dream.",
  "image": "https://example.com/book-cover.jpg",
  "totalCopies": 5,
  "addedBy": {
    "userId": "authenticated-user-id",
    "name": "Library Admin",
    "email": "admin@example.com"
  }
}
```

`totalCopies` must be a positive integer. The API returns `201 Created` with the inserted MongoDB ID.

### Borrow a book

`POST /borrows`

```json
{
  "bookId": "507f1f77bcf86cd799439011"
}
```

The operation decreases the book's available `totalCopies` and creates a borrow record containing `bookId`, the authenticated user's ID, and `borrowedAt`. A user cannot borrow the same book twice at the same time.

### Return a book

`DELETE /borrows/:id`

The operation removes the authenticated user's borrow record and increases the book's available `totalCopies`.

## Common status codes

- `200` — successful request
- `201` — resource created
- `400` — invalid ID or request data
- `401` — missing, invalid, or expired JWT
- `404` — resource not found or not owned by the user
- `409` — duplicate borrow, unavailable book, or book with active borrows
- `500` — server or database error

## Deployment on Vercel

The included `vercel.json` configures `index.js` as a Vercel Node serverless function.

Add these environment variables in the Vercel project settings:

```text
MONGODB_URI
FRONTEND_URL_LOCAL
FRONTEND_URL_VERCEL
NODE_ENV=production
```

Ensure the frontend URL is allowed by its own deployment and that its `/api/auth/jwks` endpoint is publicly reachable by the backend.

## Available scripts

The project currently has no automated test script. Run the server directly with:

```bash
node index.js
```

## License

This project is licensed under the ISC License.

## 👨‍💻 Author

**Md. Raju Ahammed**

- GitHub: [mdraju116](https://github.com/mdraju116)
