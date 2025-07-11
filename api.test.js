jest.setTimeout(30000);

const request = require("supertest");
const api = request("http://app:3000");
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  retryStrategy: null,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
});

afterAll(async () => {
  await api.close();
  redis.disconnect();
});

async function createBook(data) {
  const res = await api.post("/api/books").send(data);
  return res.body.id;
}
async function listBooks(query = "") {
  return api.get(`/api/books${query}`);
}
async function getBook(id) {
  return api.get(`/api/books/${id}`);
}
async function updateBook(id, data) {
  return api.put(`/api/books/${id}`).send(data);
}
async function deleteBook(id) {
  return api.delete(`/api/books/${id}`);
}
async function getPopular(limit) {
  return api.get(`/api/books/popular${limit ? `?limit=${limit}` : ""}`);
}

async function createUser(data) {
  const res = await api.post("/api/users").send(data);
  return res.body.id;
}
async function listUsers() {
  return api.get("/api/users");
}
async function getUserDetail(id) {
  return api.get(`/api/users/${id}`);
}
async function assignBookToUser(userId, bookId) {
  return api.post(`/api/users/${userId}/books/${bookId}`);
}
async function removeBookFromUser(userId, bookId) {
  return api.delete(`/api/users/${userId}/books/${bookId}`);
}
async function listUserBooks(userId) {
  return api.get(`/api/users/${userId}/books`);
}

const validBooks = [
  {
    title: "1984",
    author: "George Orwell",
    publishedDate: "1949-06-08",
    pages: 328,
  },
  {
    title: "Brave New World",
    author: "Aldous Huxley",
    publishedDate: "1932-08-18",
    pages: 311,
  },
  {
    title: "Animal Farm",
    author: "George Orwell",
    publishedDate: "1945-08-17",
    pages: 112,
  },
];

const invalidBooks = [
  ["missing all fields", {}],
  ["empty title", { title: "" }],
  ["empty author", { author: "" }],
  ["invalid date", { publishedDate: "not-a-date" }],
  ["negative pages", { pages: -5 }],
  ["zero pages", { pages: 0 }],
];

const validUsers = [
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob",   email: "bob@example.com" }
];
const invalidUsers = [
  ["missing all fields", {}],
  ["empty name", { name: "" }],
  ["invalid email", { email: "not-an-email" }]
];

describe("Task 1: Health Check Endpoint", () => {
  it("should return 200 OK with correct JSON structure", async () => {
    const { status, body } = await api.get("/api/health");
    expect(status, "Health endpoint should return 200 OK").toBe(200);
    expect(body, "Body should equal { status: 'OK' }").toEqual({ status: "OK" });
    expect(typeof body.status, "status should be string").toBe("string");
  });
});

describe("Task 2: Book Model and POST Route", () => {
  it.each(invalidBooks)(
    "books route should return 400 for %s",
    async (desc, payload) => {
      const { status, body } = await api.post("/api/books").send(payload);
      expect(
        status,
        `POST /api/books should return 400 for ${desc}`
      ).toBe(400);
      expect(
        body,
        `Error body should have "error" property for ${desc}`
      ).toHaveProperty("error");
    }
  );

  it("should create a book and return 201 with valid UUID", async () => {
    const { status, body } = await api.post("/api/books").send(validBooks[0]);
    expect(status, "POST /api/books should return 201").toBe(201);
    expect(body).toHaveProperty("id");
    expect(typeof body.id, "id should be string").toBe("string");
    expect(
      body.id,
      "id should match UUID format"
    ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("should create multiple books with unique IDs", async () => {
    const ids = [];
    for (const book of validBooks.slice(0, 3)) {
      const { status, body } = await api.post("/api/books").send(book);
      expect(status, `Should create book "${book.title}"`).toBe(201);
      ids.push(body.id);
    }
    const unique = new Set(ids);
    expect(unique.size, "All IDs should be unique").toBe(ids.length);
  });
});

describe("Task 3: CRUD Operations", () => {
  let bookId;
  const initial = validBooks[0];
  beforeAll(async () => {
    bookId = await createBook(initial);
  });

  it("should list all books (array) with at least one item", async () => {
    const { status, body } = await listBooks();
    expect(status, "GET /api/books should return 200").toBe(200);
    expect(Array.isArray(body), "Body should be array").toBe(true);
    expect(body.length, "Array should have >=1 element").toBeGreaterThan(0);
  });

  it("listed books should include correct fields", async () => {
    const { body } = await listBooks();
    const b = body.find((b) => b.id === bookId);
    expect(b).toBeDefined();
    expect(b).toHaveProperty("id");
    expect(b).toHaveProperty("title");
    expect(b).toHaveProperty("author");
    expect(b).toHaveProperty("publishedDate");
    expect(b).toHaveProperty("pages");
    expect(typeof b.pages, "pages should be number").toBe("number");
  });

  it("should retrieve a book by valid ID", async () => {
    const { status, body } = await getBook(bookId);
    expect(status, "GET /api/books/:id should return 200").toBe(200);
    expect(body).toHaveProperty("id", bookId);
    expect(body.title, "title should match").toBe(initial.title);
  });

  it("books route should return 404 for non-existent valid UUID", async () => {
    const fake = "00000000-0000-0000-0000-000000000000";
    const { status, body } = await getBook(fake);
    expect(status, "Should return 404 for missing book").toBe(404);
    expect(body).toHaveProperty("error");
  });

  it("books route should return 400 for invalid UUID format", async () => {
    for (const bad of ["abc", "1234", "not-a-uuid"]) {
      const { status } = await getBook(bad);
      expect(status, `Should 400 for invalid id "${bad}"`).toBe(400);
    }
  });

  it("should reject invalid updates", async () => {
    const badUpdates = [
      [{ title: "" }, "empty title"],
      [{ pages: -1 }, "negative pages"],
      [{ publishedDate: "x" }, "invalid date"],
    ];
    for (const [payload, desc] of badUpdates) {
      const { status, body } = await updateBook(bookId, payload);
      expect(status, `PUT invalid ${desc}`).toBe(400);
      expect(body).toHaveProperty("error");
    }
  });

  it("should return 404 updating non-existent book", async () => {
    const fake = "00000000-0000-0000-0000-000000000000";
    const { status, body } = await updateBook(fake, { title: "X" });
    expect(status, "PUT non-existent should 404").toBe(404);
    expect(body).toHaveProperty("error");
  });

  it("should update a book successfully", async () => {
    const newData = { title: "1984 (Updated)", pages: 350 };
    const { status, body } = await updateBook(bookId, newData);
    expect(status, "PUT should return 200").toBe(200);
    expect(body).toEqual({ id: bookId });

    const { body: updated } = await getBook(bookId);
    expect(updated.title, "title should be updated").toBe(newData.title);
    expect(updated.pages, "pages should be updated").toBe(newData.pages);
  });

  it("should return 400 deleting invalid UUID", async () => {
    for (const bad of ["abc", "123"]) {
      const { status } = await deleteBook(bad);
      expect(status, `DELETE invalid id "${bad}"`).toBe(400);
    }
  });

  it("should return 404 deleting non-existent book", async () => {
    const fake = "00000000-0000-0000-0000-000000000000";
    const { status, body } = await deleteBook(fake);
    expect(status, "DELETE non-existent should 404").toBe(404);
    expect(body).toHaveProperty("error");
  });

  it("should delete a book successfully", async () => {
    const id = await createBook({
      title: "To Be Deleted",
      author: "Test",
      publishedDate: "2020-01-01",
      pages: 100,
    });
    const { status } = await deleteBook(id);
    expect(status, "DELETE should return 204").toBe(204);

    const { status: getStatus } = await getBook(id);
    expect(getStatus, "Deleted book not found").toBe(404);
  });
});

describe("Task 4: Filtering", () => {
  let books = [];
  beforeAll(async () => {
    books = [];
    for (const b of validBooks) {
      const id = await createBook(b);
      const { body } = await getBook(id);
      books.push(body);
    }
  });

  it("should filter by author", async () => {
    const { status, body } = await listBooks(`?author=Orwell`);
    expect(status, "filter by author").toBe(200);
    body.forEach((b) => {
      expect(b.author).toMatch(/Orwell/);
    });
  });

  it("should filter by publishedDate range", async () => {
    const start = "1930-01-01";
    const end = "1940-12-31";
    const { status, body } = await listBooks(`?startDate=${start}&endDate=${end}`);
    expect(status, "date range filter").toBe(200);
    body.forEach((b) => {
      const pd = new Date(b.publishedDate);
      expect(pd >= new Date(start) && pd <= new Date(end)).toBe(true);
    });
  });

  it("should filter by pages range", async () => {
    const { status, body } = await listBooks(`?minPages=300&maxPages=330`);
    expect(status, "pages range filter").toBe(200);
    body.forEach((b) => {
      expect(b.pages).toBeGreaterThanOrEqual(300);
      expect(b.pages).toBeLessThanOrEqual(330);
    });
  });

  it("should combine multiple filters", async () => {
    const q = `?author=Orwell&minPages=100&maxPages=400`;
    const { status, body } = await listBooks(q);
    expect(status, "combined filters").toBe(200);
    body.forEach((b) => {
      expect(b.author).toMatch(/Orwell/);
      expect(b.pages).toBeGreaterThanOrEqual(100);
      expect(b.pages).toBeLessThanOrEqual(400);
    });
  });

  it("should return empty array for invalid date format", async () => {
    const { status, body } = await listBooks("?startDate=foo");
    expect(status, "invalid date filter").toBe(400);
    expect(body).toHaveProperty("error");
  });

  it("should return all books when no filters", async () => {
    const { status, body } = await listBooks();
    expect(status, "no-filter list").toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(books.length);
  });
});

describe("Task 5: Basic Caching", () => {
    let bookId;
    const listKey = `booksList::${JSON.stringify({})}`;
  
    beforeAll(async () => {
      await redis.flushall();
      bookId = await createBook(validBooks[0]);
    });
  
    it("caches GET /api/books under a list key", async () => {
      const { status } = await listBooks();
      expect(status).toBe(200);
  
      const cached = await redis.get(listKey);
      expect(cached, "booksList key should exist after first GET").not.toBeNull();
    });
  
    it("caches GET /api/books/:id under book:id key", async () => {
      const key = `book:${bookId}`;
      await redis.del(key);
  
      const { status } = await getBook(bookId);
      expect(status).toBe(200);
  
      const cached = await redis.get(key);
      expect(cached, "book:id key should exist after GET by ID").not.toBeNull();
    });
  });
  
  describe("Task 6: TTL Tuning", () => {
    let bookId;
    const listKey = `booksList::${JSON.stringify({})}`;
  
    beforeAll(async () => {
      bookId = await createBook(validBooks[1]);
      await listBooks();
      await getBook(bookId);
    });
  
    it("sets booksList TTL to ≤ 300 seconds", async () => {
      const ttl = await redis.ttl(listKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl, "booksList TTL should be at most 300s").toBeLessThanOrEqual(300);
    });
  
    it("sets book:id TTL to ≤ 3600 seconds", async () => {
      const key = `book:${bookId}`;
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl, "single-book TTL should be at most 3600s").toBeLessThanOrEqual(3600);
    });
  });
  
  describe("Task 7: Cache Invalidation", () => {
    let bookId;
    const listKey = `booksList::${JSON.stringify({})}`;
  
    beforeAll(async () => {
      await redis.flushall();
      bookId = await createBook(validBooks[2]);
      await listBooks();
      await getBook(bookId);
    });
  
    it("clears list cache on new book creation", async () => {
      expect(await redis.exists(listKey)).toBe(1);
  
      await createBook({
        title: "Cache Invalidate Test",
        author: "Tester",
        publishedDate: "2021-01-01",
        pages: 100,
      });
  
      expect(
        await redis.exists(listKey),
        "booksList key should be removed after POST"
      ).toBe(0);
    });
  
    it("clears list & single cache on update", async () => {
      const bookKey = `book:${bookId}`;
      await listBooks();
      await getBook(bookId);
  
      expect(await redis.exists(listKey)).toBe(1);
      expect(await redis.exists(bookKey)).toBe(1);
  
      await updateBook(bookId, { title: "Updated Title" });
  
      expect(
        await redis.exists(listKey),
        "booksList key should be removed after PUT"
      ).toBe(0);
      expect(
        await redis.exists(bookKey),
        "book:id key should be removed after PUT"
      ).toBe(0);
    });
  
    it("clears list & single cache on delete", async () => {
      const tempId = await createBook({
        title: "Temp Delete",
        author: "Tester",
        publishedDate: "2022-02-02",
        pages: 200,
      });
      const tempKey = `book:${tempId}`;
      await listBooks();
      await getBook(tempId);
  
      expect(await redis.exists(listKey)).toBe(1);
      expect(await redis.exists(tempKey)).toBe(1);
  
      await deleteBook(tempId);
  
      expect(
        await redis.exists(listKey),
        "booksList key should be removed after DELETE"
      ).toBe(0);
      expect(
        await redis.exists(tempKey),
        "book:id key should be removed after DELETE"
      ).toBe(0);
    });
  });
  
  describe("Task 8: Users Route", () => {
    it.each(invalidUsers)(
      "users route should return 400 for %s",
      async (desc, payload) => {
        const { status, body } = await api.post("/api/users").send(payload);
        expect(status, `POST /api/users should return 400 for ${desc}`).toBe(400);
        expect(body, `Error body should have "error" property for ${desc}`).toHaveProperty("error");
      }
    );
  
    it("should create a user and return 201 with valid UUID", async () => {
      const { status, body } = await api.post("/api/users").send(validUsers[0]);
      expect(status, "POST /api/users should return 201").toBe(201);
      expect(body).toHaveProperty("id");
      expect(typeof body.id, "id should be string").toBe("string");
      expect(
        body.id,
        "id should match UUID format"
      ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  
    it("should list all users (array) with at least one item", async () => {
      const { status, body } = await listUsers();
      expect(status, "GET /api/users should return 200").toBe(200);
      expect(Array.isArray(body), "Body should be array").toBe(true);
      expect(body.length, "Array should have >=1 element").toBeGreaterThan(0);
    });
  
    it("should retrieve a user by valid ID", async () => {
      const userId = await createUser(validUsers[1]);
      const { status, body } = await getUserDetail(userId);
      expect(status, "GET /api/users/:id should return 200").toBe(200);
      expect(body).toHaveProperty("id", userId);
      expect(body.name, "name should match").toBe(validUsers[1].name);
    });
  
    it("users route should return 404 for non-existent valid UUID", async () => {
      const fake = "00000000-0000-0000-0000-000000000000";
      const { status, body } = await getUserDetail(fake);
      expect(status, "Should return 404 for missing user").toBe(404);
      expect(body).toHaveProperty("error");
    });
  
    it("users route should return 400 for invalid UUID format", async () => {
      for (const bad of ["abc", "1234", "not-a-uuid"]) {
        const { status } = await getUserDetail(bad);
        expect(status, `Should 400 for invalid id "${bad}"`).toBe(400);
      }
    });
  });
  
  describe("Task 9: User–Book Ownership", () => {
    let userId;
    let bookId;
  
    beforeAll(async () => {
      userId = await createUser({ name: "Charlie", email: "charlie@example.com" });
      bookId = await createBook(validBooks[0]);
    });
  
    it("should assign a book to a user", async () => {
      const { status, body } = await assignBookToUser(userId, bookId);
      expect(status, "POST /api/users/:userId/books/:bookId should return 200").toBe(200);
      expect(body).toHaveProperty("message", "Book assigned to user");
    });
  
    it("should list a user's books", async () => {
      const { status, body } = await listUserBooks(userId);
      expect(status, "GET /api/users/:userId/books should return 200").toBe(200);
      expect(Array.isArray(body), "Body should be array").toBe(true);
      expect(body.find((b) => b.id === bookId), "Array should contain the assigned book").toBeDefined();
    });
  
    it("should return 404 when assigning non-existent user or book", async () => {
      const fakeUser = "00000000-0000-0000-0000-000000000000";
      const fakeBook = "00000000-0000-0000-0000-000000000000";

      let { status, body } = await assignBookToUser(fakeUser, bookId);
      expect(status, "POST with non-existent user").toBe(404);
      expect(body, "Error body should have 'error'").toHaveProperty("error");

      ({ status, body } = await assignBookToUser(userId, fakeBook));
      expect(status, "POST with non-existent book").toBe(404);
      expect(body, "Error body should have 'error'").toHaveProperty("error");
    });
  
    it("should return 400 for malformed UUIDs on assign", async () => {
      const res = await assignBookToUser("bad-id", "also-bad");
      expect(res.status, "Should 400 for malformed UUIDs").toBe(400);
    });
  
    it("should remove a book from a user", async () => {
      const { status } = await removeBookFromUser(userId, bookId);
      expect(status, "DELETE /api/users/:userId/books/:bookId should return 204").toBe(204);
  
      const { status: listStatus, body } = await listUserBooks(userId);
      expect(listStatus, "After removal, listing should still be 200").toBe(200);
      expect(body.find((b) => b.id === bookId), "Removed book should no longer appear").toBeUndefined();
    });
  
    it("should return 404 when removing a non-owned or non-existent book", async () => {
      const tempBook = "00000000-0000-0000-0000-000000000000";
      let { status, body } = await removeBookFromUser(userId, tempBook);
      expect(status, "DELETE non-existent book").toBe(404);
      expect(body, "Error body should have 'error'").toHaveProperty("error");
  
      ({ status, body } = await removeBookFromUser(userId, bookId));
      expect(status, "DELETE already-removed book").toBe(404);
      expect(body, "Error body should have 'error'").toHaveProperty("error");
    });
  
    it("should return 400 for malformed UUIDs on remove", async () => {
      const res = await removeBookFromUser("bad-user", "bad-book");
      expect(res.status, "Should 400 for malformed UUIDs").toBe(400);
    });
  });