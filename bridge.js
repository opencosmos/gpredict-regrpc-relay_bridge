#!/usr/bin/env node

const gpredict_default_port = 6969;

const default_ref_freq = 145.890e6;

const net = require('net');
const random_id = require('random').chars('0123456789abcdef');

const RegRPCCli = require('regrpccli');

const gs = process.env.GS || process.argv[2];

if (!gs) {
	console.error('No GS specified');
	process.exit(1);
}

const gpredict = { host: '127.0.0.1', port: process.env.PORT || gpredict_default_port };

const regs = new RegRPCCli({ name: `gp:${process.env.INSTANCE || random_id(8)}` });

const ref_freq = +(process.env.REF_FREQ || default_ref_freq);

const session = (regs, sock) => {

	let RX = false;
	let TX = false;

	let prx = ref_freq;
	let ptx = ref_freq;

	const handle_cmd = ([cmd, data = null]) => {
		switch (cmd) {
		case 'V':
			RX = data === 'Sub';
			TX = data === 'Main';
			return 'RPRT 0';
		case 'f':
			return RX ? prx : TX ? ptx : '-';
		case 't':
			return RX ? 0 : TX ? 1 : '-';
		case 'F':
			if (RX) {
				prx = data;
				regs.set('RX relative frequency shift', 1 - data / ref_freq);
			} else if (TX) {
				ptx = data;
				regs.set('TX relative frequency shift', data / ref_freq - 1);
			}
			return 'RPRT 0';
		default:
			return 'RPRT -1';
		}
	};

	let buf = '';

	const read_command = () => {
		const nl = buf.indexOf('\n');
		if (nl === -1) {
			return null;
		}
		const cmd = buf.substr(0, nl);
		buf = buf.substr(nl + 1);
		return cmd;
	};

	const handle_cmd_wrap = rawdata => {
		buf += rawdata.toString('utf8');
		let cmd;
		while ((cmd = read_command()) !== null) {
			sock.write(`${handle_cmd(cmd.split(/\s+/))}\n`);
		}
	};

	console.log(`gPredict connection from ${sock.remoteAddress}:${sock.remotePort}`);

	const closed = () => console.log(`gPredict conncetion closed from ${sock.remoteAddress}:${sock.remotePort}`);

	sock.on('data', handle_cmd_wrap);

	sock.on('close', closed);

	process.stderr.write('\n');
};

async function run() {
	console.info('');
	console.info(`TUNE gPredict RX+TX FREQUENCIES TO ${(ref_freq / 1e6).toFixed(6)}MHz!`);
	const server = net.createServer(socket => session(regs.bind(gs), socket));
	await new Promise((res, rej) => server.listen(gpredict.port, gpredict.host, 1, e => e ? rej(e) : res()));
	console.info('');
	console.log(`Server listening on ${gpredict.host}:${gpredict.port}`);
	console.info('');
}

run().catch(err => console.error(`Failed: ${err.stack}`));
