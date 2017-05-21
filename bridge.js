#!/usr/bin/env node

const RegRPC = require('./regrpc');

const gs = process.env.GS || process.argv[2];

if (!gs) {
	console.error('No GS specified');
	process.exit(1);
}

const net = require('net');

const gpredict_default_port = 6969;

const gpredict = { host: '127.0.0.1', port: process.env.PORT || gpredict_default_port };

const random_id = require('random').chars('0123456789abcdef');

const _regs = RegRPC.create({ name: `gp:${process.env.INSTANCE || random_id(8)}` });

const ref_freq = 145.89e6;

const session = (regs, sock, rx_freq, tx_freq) => {

	let RX = false;
	let TX = false;

	let drx = 0;
	let dtx = 0;

	const handle_cmd = async data => {
		/*
		 * V Sub for RX and V Main for TX (according to hamlib notation)
		 *
		 * The follwoing sets of conditional statements are done following the
		 * hamlib protocol for rigctld
		 *
		 * The set of rules are prepared for a full duplex "gpredict"
		 * configuration
		 */
		if (/Sub/.test(data)) {
			/* RX mode */
			RX = true;
			TX = false;
		} else if (/Main/.test(data)) {
			/* TX mode */
			RX = false;
			TX = true;
		}
		const write = async (fn, def) => {
			let value = def;
			let e;
			try {
				value = await fn();
			} catch (err) {
				e = err;
			}
			sock.write(String(value));
			if (e) {
				throw e;
			}
		};
		if (/^[a-z]/.test(data)) {
			/* gPredict getters dummmy response */
			if (/t/.test(data) && RX) {
				sock.write('0');
			} else if (/t/.test(data) && TX) {
				sock.write('1');
			} else if (/f/.test(data) && RX) {
				const shift = await regs.get('RX frequency shift');
				await write(() => ref_freq * shift / rx_freq, ref_freq);
			} else if (/f/.test(data) && TX) {
				const shift = await regs.get('TX frequency shift');
				await write(() => ref_freq * shift / tx_freq, ref_freq);
			}
		} else if (/^[A-Z]/.test(data)) {
			/* gPredict setters */
			try {
				if (/^F/.test(data)) {
					const value = data.match(/\d+/)[0];
					if (RX) {
						const shift = (value / ref_freq - 1) * rx_freq;
						await regs.set('RX frequency shift', shift);
						drx = shift;
					} else if (TX) {
						const shift = (value / ref_freq - 1) * tx_freq;
						await regs.set('TX frequency shift', shift);
						dtx = shift;
					}
				}
			} finally {
				/* Acknowledge to gPredict */
				sock.write('RPRT 0');
			}
		}
	};

	const handle_cmd_wrap = async rawdata => {
		try {
			await handle_cmd(rawdata.toString('utf8'));
		} catch (e) {
			console.error(`Failed to execute command: ${e.stack}`);
			sock.destroy();
		}
	};

	console.log(`gPredict connection from ${sock.remoteAddress}:${sock.remotePort}`);

	const dashboard = () => {
		let s = `f_rx=${(rx_freq + drx) | 0}, f_tx=${(tx_freq + dtx) | 0}, Δf_rx=${drx | 0} Δf_tx=${dtx | 0}`;
		while (s.length < process.env.COLUMNS) {
			s += ' ';
		}
		process.stderr.write(`${s}\r`);
	};

	const interval = setInterval(dashboard, 300);

	const closed = () => {
		clearInterval(interval);
		console.log(`gPredict conncetion closed from ${sock.remoteAddress}:${sock.remotePort}`);
	};

	sock.on('data', handle_cmd_wrap);

	sock.on('close', closed);

	process.stderr.write('\n');
};

async function get_current_freq(regs) {
	try {
		return await Promise.all([regs.get('RX frequency'), regs.get('TX frequency')]);
	} catch (e) {
		console.error('Failed to query radio');
		throw e;
	}
}

async function run() {
	const regs = (await _regs).bind(gs);
	console.info('');
	console.info(`TUNE gPredict RX+TX FREQUENCIES TO ${(ref_freq / 1e6).toFixed(6)}MHz!`);
	console.info('');
	console.info('Querying radio centre frequency');
	const [rx, tx] = (await get_current_freq(regs)).map(Number);
	console.info(`Query resolved, radio is configured for rx=${rx} tx=${tx}`);
	console.info('');
	const server = net.createServer(socket => session(regs, socket, rx, tx));
	server.listen(gpredict.port, gpredict.host);
	console.log(`Server listening on ${gpredict.host}:${gpredict.port}`);
	console.info('');
}

run().catch(err => console.error(`Failed: ${err.stack}`));
