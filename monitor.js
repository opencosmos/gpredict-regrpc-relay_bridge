#!/usr/bin/env node

const _ = require('lodash');
const RegRPC = require('regrpccli');
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

const unansi = x => x.replace(/\x1b\[[^m]+m/g, '');

const pad = (x, width, ch = ' ') => new Array(Math.max(0, 1 + width - unansi(x).length)).join(ch);

function format_history(str) {
	const data = str.split(';')
		.filter(s => s)
		.map(s => {
			const [time, min, mean, max] = s.split(',');
			return {
				time: new Date(time * 1000),
				min: parseFloat(min),
				mean: parseFloat(mean),
				max: parseFloat(max)
			};
		});
	while (data.length > 30) {
		data.shift();
	}
	const min = Math.min(...data.map(x => x.min));
	const max = Math.max(...data.map(x => x.max), min + 6);
	for (let i = 0; i < data.length; ++i) {
		data[i] = (data[i].mean - min) / (max - min);
	}
	const braille = ' ⡀⣀⣄⣤⣦⣶⣿⣷⣿';
	const ascii = ' ¸.·´¨';
	const img = ascii;
	return data.map(x => img[Math.round(x * (img.length - 1))]).join('');
}

async function run() {
	const cache = new Cache();
	const regrpc = (await RegRPC.create({ name: `gp:${process.env.INSTANCE || random_id(8)}` }));
	const regs = regrpc.bind(gs);
	const probe = () => Promise.all([
		regs.get('RSSI', false),
		regs.get('RSSI min', false),
		regs.get('RSSI max', false),
		regs.get('RSSI history (1s)', false),
		regs.get('RSSI history (5s)', false),
		regs.get('Noise floor', false),
		regs.get('RX antenna', false),
		regs.get('TX antenna', false),
		regs.get('RX rate', false),
		regs.get('TX rate', false),
		regs.get('RX gain', false),
		regs.get('TX gain', false),
		regs.get('RX LO offset', false),
		regs.get('TX LO offset', false),
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
		const cached = cache.getall();
		const blocks = !cached.length ? ['(no data available)'] : _(cached)
			.sortBy(['gs', 'key'])
			.groupBy('gs')
			.toPairs()
			.map(([name, kv]) => {
				const out = [];
				out.push(`\x1b[1m${name}\x1b[0m`);
				let c = null;
				const firstword = s => (s || '').match(/^\S*/)[0];
				for (const { key, value } of kv) {
					if (c !== firstword(key)) {
						out.push('');
					}
					c = firstword(key);
					let k = `${key} \x1b[90;2m`;
					k += pad(k, 30, '…');
					k += '\x1b[37;22m';
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
							fmt += ` ago at ${when.toUTCString().replace(/\bGMT\b/, 'UTC')}`;
						}
					} else if (/\b(RSSI history)\b/.test(key)) {
						fmt = `[\x1b[9m${format_history(value)}\x1b[29m]`;
					} else if (/\b(frequency|rate|LO offset)\b/.test(key)) {
						fmt = si(+value, 'Hz', { signcol: true, sign: /\b(shift|offset)\b/.test(key), precision: 3 });
					} else if (/\b(gain|RSSI|floor)\b/.test(key)) {
						fmt = si(+value, 'dB', { signcol: true, no_prefix: true });
					} else if (/\b(packets)\b/.test(key)) {
						fmt = si(+value, 'packets', { signcol: true, no_prefix: true, precision: 0 });
					} else {
						fmt = value;
					}
					out.push(`${k} ${fmt}`);
				}
				return {
					width: Math.max(...out.map(s => unansi(s).length), 0),
					data: out
				};
			})
			.map(block => {
				block.data = block.data.map(line => `│ ${line + pad(line, block.width)} │`);
				block.data.unshift(`┌─${pad('', block.width, '─')}─┐`);
				block.data.push(`└─${pad('', block.width, '─')}─┘`);
				return block;
			})
			.reduce((screen, block) => {
				const append = (xs, c, r, x) => {
					while (xs.length <= r) {
						xs.push('');
					}
					xs[r] += pad(xs[r], c);
					xs[r] += x;
				};
				while (screen.y < screen.data.length && unansi(screen.data[screen.y]).length + block.width > screen.width) {
					screen.y++;
				}
				const col = screen.y < screen.data.length ? unansi(screen.data[screen.y]).length : 0;
				for (let i = 0; i < block.data.length; ++i) {
					append(screen.data, col, screen.y + i, block.data[i]);
				}
				return screen;
			}, { data: [], width: process.stdout.columns || 160, height: process.stdout.rows || 45, y: 0 })
			.data;
		const out = [];
		out.push(`\x1b[H\x1b[J\x1b[s\x1b[7l${new Date().toISOString()}`);
		out.push('');
		out.push(...blocks);
		out.push('\x1b[7h\x1b[u');
		const data = out.map(s => `${s}\n`).join('');
		process.stdout.write(data);
	};
	setInterval(probe, 500);
	setInterval(update, 500);
	process.stdout.on('resize', update);
	regrpc.on('response', handle_response);
}

process.on('exit', () => process.stdout.write('\x1bc'));
process.on('SIGINT', () => { process.stdout.write('\x1bc'); process.exit(0); });

run().catch(err => console.error(`Failed: ${err.stack}`));
