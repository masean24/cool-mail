// Simple in-memory rate limiter
const rateLimitStore = new Map();

const rateLimit = (options = {}) => {
    const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
    const maxRequests = options.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 60;

    // Cleanup old entries every minute
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of rateLimitStore.entries()) {
            if (now - value.startTime > windowMs) {
                rateLimitStore.delete(key);
            }
        }
    }, 60000);

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        if (!rateLimitStore.has(ip)) {
            rateLimitStore.set(ip, {
                count: 1,
                startTime: now,
            });
            return next();
        }

        const record = rateLimitStore.get(ip);

        // Reset if window expired
        if (now - record.startTime > windowMs) {
            rateLimitStore.set(ip, {
                count: 1,
                startTime: now,
            });
            return next();
        }

        // Check limit
        if (record.count >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((record.startTime + windowMs - now) / 1000),
            });
        }

        record.count++;
        next();
    };
};

export default rateLimit;
