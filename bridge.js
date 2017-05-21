#!/usr/bin/env node

const gpredict_default_port = 6969;

const default_ref_freq = 145.890e6;

const RegRPC = require('./regrpc');
const net = require('net');
const random_id = require('random').chars('0123456789abcdef');

const gs = process.env.GS || process.argv[2];

if (!gs) {
	console.error('No GS specified');
	process.exit(1);
}

const gpredict = { host: '127.0.0.1', port: process.env.PORT || gpredict_default_port };

const _regs = RegRPC.create({ name: `gp:${process.env.INSTANCE || random_id(8)}` });

const ref_freq = +(process.env.REF_FREQ || default_ref_freq);

const session = (regs, sock) => {

	let RX = false;
	let TX = false;

	let prx = ref_freq;
	let ptx = ref_freq;

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
		if (/^[tf]/.test(data)) {
			/* gPredict getters dummmy response */
			if (/t/.test(data) && RX) {
				sock.write('0');
			} else if (/t/.test(data) && TX) {
				sock.write('1');
			} else if (/f/.test(data) && RX) {
				sock.write(String(prx));
			} else if (/f/.test(data) && TX) {
				sock.write(String(ptx));
			}
		} else if (/^[F]/.test(data)) {
			/* gPredict setters */
			try {
				if (/^F/.test(data)) {
					const value = data.match(/\d+/)[0];
					if (RX) {
						prx = value;
						await regs.set('RX relative frequency shift', value / ref_freq - 1);
					} else if (TX) {
						ptx = value;
						await regs.set('TX relative frequency shift', value / ref_freq - 1);
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
			/* Null */
		}
	};

	console.log(`gPredict connection from ${sock.remoteAddress}:${sock.remotePort}`);

	const closed = () => console.log(`gPredict conncetion closed from ${sock.remoteAddress}:${sock.remotePort}`);

	sock.on('data', handle_cmd_wrap);

	sock.on('close', closed);

	process.stderr.write('\n');
};

async function run() {
	const regs = (await _regs).bind(gs);
	console.info('');
	console.info(`TUNE gPredict RX+TX FREQUENCIES TO ${(ref_freq / 1e6).toFixed(6)}MHz!`);
	const server = net.createServer(socket => session(regs, socket));
	await new Promise((res, rej) => server.listen(gpredict.port, gpredict.host, 1, e => e ? rej(e) : res()));
	console.info('');
	console.log(`Server listening on ${gpredict.host}:${gpredict.port}`);
	console.info('');
}

run().catch(err => console.error(`Failed: ${err.stack}`));
