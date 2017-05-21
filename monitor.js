#!/usr/bin/env node

const _ = require('lodash');
const RegRPC = require('./regrpc');
const Cache = require('./monitor_cache');

const gs = process.env.GS || process.argv[2] || 'gs:*';
const random_id = require('random').chars('0123456789abcdef');

async function run() {
	const cache = new Cache();
	const regrpc = (await RegRPC.create({ name: `gp:${process.env.INSTANCE || random_id(8)}` }));
	const regs = regrpc.bind(gs);
	const probe = () => Promise.all([
		regs.get('RSSI', false),
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
				for (const { key, value } of kv) {
					let k = `  ${key} `;
					while (k.length < 30) {
						k += '.';
					}
					out.push(`${k} ${value}`);
				}
				out.push('');
			});
		out.push('');
		const data = out.map(s => `${s}\n`).join('');
		process.stdout.write(data);
	};
	setInterval(probe, 1000);
	setInterval(update, 200);
	regrpc.on('response', handle_response);
}

run().catch(err => console.error(`Failed: ${err.stack}`));
