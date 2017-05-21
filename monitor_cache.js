module.exports = Cache;

function Cache() {
	const now = () => new Date() / 1000;
	const cache = new Map();
	const touch_gs = gs => {
		if (!cache.has(gs)) {
			return;
		}
		const res = cache.get(gs);
		res.expires = now() + 5;
	};
	const need_gs = gs => {
		if (cache.has(gs)) {
			touch_gs(gs);
			return cache.get(gs).keys;
		}
		const keys = new Map();
		cache.set(gs, { keys, expires: null });
		touch_gs(gs);
		return keys;
	};
	const set = (gs, key, value) => {
		const keys = need_gs(gs);
		keys.set(key, value);
	};
	const purge = () => {
		const t = now();
		for (const [gs, res] of [...cache.entries()]) {
			if (res.expires < t) {
				cache.delete(gs);
			}
		}
	};
	const getall = () => {
		purge();
		return [...cache.entries()].map(
			([gs, { keys }]) => [...keys.entries()].map(([key, value]) => ({
				gs, key, value })))
			.reduce((xs, x) => xs.concat(x), []);
	};
	this.set = set;
	this.purge = purge;
	this.getall = getall;
}
