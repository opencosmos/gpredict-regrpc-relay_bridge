#!/usr/bin/env node

const _ = require('lodash');
const RegRPC = require('./regrpc');
const Cache = require('./monitor_cache');

const gs = process.env.GS || process.argv[2] || 'gs:*';
const random_id = require('random').chars('0123456789abcdef');

const si = (x, unit, { sign = false, signcol = false, precision = 2, width = 8, no_prefix = false, min_prefix = 'z', max_prefix = 'Z', dimunit = true }) => {
	if (isNaN(x)) {
		return 'NaN';
	}
	const s = x === 0 ? sign ? '±' : signcol ? ' ' : '' : x < 0 ? '-' : sign ? '+' : signcol ? ' ' : '';
	x = Math.abs(x);
	if (no_prefix) {
		min_prefix = ' ';
		max_prefix = ' ';
	}
	const prefixes = 'zafpnμm kMGTPEZ';
	const lmin = prefixes.indexOf(min_prefix) - 7;
	const lmax = prefixes.indexOf(max_prefix) - 7;
	const l = Math.max(lmin, Math.min(lmax, x === 0 || x === Infinity ? 0 : Math.floor(Math.log10(x) / 3)));
	const num = x === Infinity ? 'inf' : (x / Math.pow(10, 3 * l)).toFixed(precision);
	const pad = new Array(Math.max(0, width + 1 - num.length - s.length)).join(' ');
	const unit_fmt = dimunit ? u => `\x1b[2m${u}\x1b[22m` : u => u;
	return `${s}${num}${pad} ${unit_fmt(`${prefixes[l + 7].trim()}${unit}`)}`;
};

async function run() {
	const cache = new Cache();
	const regrpc = (await RegRPC.create({ name: `gp:${process.env.INSTANCE || random_id(8)}` }));
	const regs = regrpc.bind(gs);
	const probe = () => Promise.all([
		regs.get('RSSI', false),
		regs.get('RSSI min', false),
		regs.get('RSSI max', false),
		regs.get('Noise floor', false),
		regs.get('RX rate', false),
		regs.get('TX rate', false),
		regs.get('RX gain', false),
		regs.get('TX gain', false),
		regs.get('RX frequency', false),
		regs.get('TX frequency', false),
		regs.get('RX frequency shift', false),
		regs.get('TX frequency shift', false),
		regs.get('RX packets', false),
		regs.get('TX packets', false),
		regs.get('Time', false),
		regs.get('Last RX time', false),
		regs.get('Last TX time', false),
	]).catch(() => null);
	const handle_response = (remote, res) => {
		if (res.Error) {
			return;
		}
		cache.set(remote, res.Key, res.Value);
	};
	const update = () => {
		const out = [`\x1b[H\x1b[J${new Date().toISOString()}`];
		out.push('');
		const cached = cache.getall();
		if (!cached.length) {
			out.push('(no data available)');
		}
		_(cached)
			.sortBy(['gs', 'key'])
			.groupBy('gs')
			.toPairs()
			.each(([name, kv]) => {
				out.push(`\x1b[1m${name}\x1b[0m`);
				let c = null;
				const firstword = s => (s || '').match(/^\S*/)[0];
				for (const { key, value } of kv) {
					if (c !== null && c !== firstword(key)) {
						out.push('');
					}
					c = firstword(key);
					let k = `  ${key} \x1b[2m`;
					while (k.length < 30) {
						k += '.';
					}
					k += '\x1b[22m';
					let fmt = '';
					if (/\bTime$/.test(key)) {
						fmt = new Date(+value * 1000).toUTCString().replace(/\bGMT\b/, 'UTC');
					} else if (/\btime$/.test(key)) {
						if (value === '-inf') {
							fmt = 'never';
						} else {
							const time = new Date(+_.find(cached, { gs: name, key: 'Time' }).value * 1000);
							const when = new Date(+value * 1000);
							const dt = (+time - +when) / 1000;
							fmt = si(dt, 's', { signcol: true, no_prefix: true, precision: 0 });
							fmt += ` ago, at ${when.toUTCString().replace(/\bGMT\b/, 'UTC')}`;
						}
					} else if (/\b(frequency|rate)\b/.test(key)) {
						fmt = si(+value, 'Hz', { signcol: true, sign: /\bshift\b/.test(key), precision: 3 });
					} else if (/\b(gain|RSSI|floor)\b/.test(key)) {
						fmt = si(+value, 'dB', { signcol: true, no_prefix: true });
					} else if (/\b(packets)\b/.test(key)) {
						fmt = si(+value, 'packets', { signcol: true, no_prefix: true, precision: 0 });
					} else {
						fmt = value;
					}
					out.push(`${k} ${fmt}`);
				}
				out.push('');
			});
		out.push('');
		const data = out.map(s => `${s}\n`).join('');
		process.stdout.write(data);
	};
	setInterval(probe, 400);
	setInterval(update, 200);
	regrpc.on('response', handle_response);
}

run().catch(err => console.error(`Failed: ${err.stack}`));
