const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase-admin');
const { google } = require('googleapis');
const puppeteer = require('puppeteer');

// Initialize Google Books API
const books = google.books({
    version: 'v1',
    auth: process.env.GOOGLE_BOOKS_API_KEY
});

// Cache for storing prices with expiration
const priceCache = new Map();
const CACHE_EXPIRATION = 3600000; // 1 hour in milliseconds

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
    try {
        const user = await admin.auth().getUser(req.session.userId);
        const customClaims = (await admin.auth().getUser(user.uid)).customClaims;
        if (customClaims && customClaims.admin) {
            next();
        } else {
            res.status(403).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        res.status(403).json({ error: 'Unauthorized' });
    }
};

// Get all books with prices
router.get('/api/books', async (req, res) => {
    try {
        const booksRef = db.collection('books');
        const snapshot = await booksRef.get();
        const books = [];
        
        for (const doc of snapshot.docs) {
            const bookData = doc.data();
            const prices = await fetchPrices(bookData.amazonUrl, bookData.flipkartUrl);
            books.push({ 
                id: doc.id, 
                ...bookData,
                prices
            });
        }
        
        res.json(books);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get book details
router.get('/api/books/:id', async (req, res) => {
    try {
        const bookRef = db.collection('books').doc(req.params.id);
        const doc = await bookRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Book not found' });
        }
        const bookData = doc.data();

        // Fetch Google Books data
        if (bookData.googleBookId) {
            const googleBookData = await books.volumes.get({ volumeId: bookData.googleBookId });
            bookData.googleData = googleBookData.data;
        }

        // Fetch prices
        const prices = await fetchPrices(bookData.amazonUrl, bookData.flipkartUrl);
        bookData.prices = prices;

        res.json({ id: doc.id, ...bookData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Routes
// Add new book
router.post('/api/admin/books', isAdmin, async (req, res) => {
    try {
        const { title, author, description, imageUrl, amazonUrl, flipkartUrl, googleBookId } = req.body;
        
        // Fetch Google Books data
        let googleData = null;
        if (googleBookId) {
            const response = await books.volumes.get({ volumeId: googleBookId });
            googleData = response.data;
        }

        const docRef = await db.collection('books').add({
            title,
            author,
            description,
            imageUrl,
            amazonUrl,
            flipkartUrl,
            googleBookId,
            googleData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ id: docRef.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update book
router.put('/api/admin/books/:id', isAdmin, async (req, res) => {
    try {
        const { title, author, description, imageUrl, amazonUrl, flipkartUrl, googleBookId } = req.body;
        
        // Fetch Google Books data
        let googleData = null;
        if (googleBookId) {
            const response = await books.volumes.get({ volumeId: googleBookId });
            googleData = response.data;
        }

        await db.collection('books').doc(req.params.id).update({
            title,
            author,
            description,
            imageUrl,
            amazonUrl,
            flipkartUrl,
            googleBookId,
            googleData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete book
router.delete('/api/admin/books/:id', isAdmin, async (req, res) => {
    try {
        await db.collection('books').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper functions for price fetching
async function fetchPrices(amazonUrl, flipkartUrl) {
    const prices = {
        amazon: null,
        flipkart: null
    };

    if (amazonUrl) {
        prices.amazon = await fetchAmazonPrice(amazonUrl);
    }
    if (flipkartUrl) {
        prices.flipkart = await fetchFlipkartPrice(flipkartUrl);
    }

    return prices;
}

async function getCachedPrice(url, type) {
    const cached = priceCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION) {
        return cached.price;
    }
    return null;
}

async function setCachedPrice(url, price) {
    priceCache.set(url, {
        price,
        timestamp: Date.now()
    });
}

async function fetchAmazonPrice(url) {
    try {
        // Check cache first
        const cachedPrice = await getCachedPrice(url, 'amazon');
        if (cachedPrice) return cachedPrice;

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0' });
        
        // Wait for price element and extract it
        const priceElement = await page.$('.a-price-whole');
        let price = null;
        
        if (priceElement) {
            price = await page.evaluate(el => el.textContent.replace(/[^\d.]/g, ''), priceElement);
            price = parseFloat(price);
        }

        await browser.close();
        
        // Cache the price
        if (price) {
            await setCachedPrice(url, price);
        }
        
        return price;
    } catch (error) {
        console.error('Error fetching Amazon price:', error);
        return null;
    }
}

async function fetchFlipkartPrice(url) {
    try {
        // Check cache first
        const cachedPrice = await getCachedPrice(url, 'flipkart');
        if (cachedPrice) return cachedPrice;

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0' });
        
        // Wait for price element and extract it
        const priceElement = await page.$('._30jeq3');
        let price = null;
        
        if (priceElement) {
            price = await page.evaluate(el => el.textContent.replace(/[^\d.]/g, ''), priceElement);
            price = parseFloat(price);
        }

        await browser.close();
        
        // Cache the price
        if (price) {
            await setCachedPrice(url, price);
        }
        
        return price;
    } catch (error) {
        console.error('Error fetching Flipkart price:', error);
        return null;
    }
}

module.exports = router;
