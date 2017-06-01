#!/usr/bin/env node

const default_ref_freq = 145.890e6;
const max_relshift = 0.1;

const net = require('net');

const dgram = require('dgram');

const port_gp = +process.env.PORT_GP;
const port_udp = +process.env.PORT_UDP;

const gpredict = { host: '127.0.0.1', port: port_gp };
const bridge = { host: '::1', port: port_udp };

const udp = dgram.createSocket('udp6');

const gs = process.env.GS || process.argv[2];

const ref_freq = +(process.env.REF_FREQ || default_ref_freq);

const set_shift = relshift => {
	if (Math.abs(relshift) > max_relshift) {
		throw new Error(`Relative shift is extreme (>10%), you probably misconfigured the reference frequency.  It should be ${ref_freq}`);
	}
	udp.send(JSON.stringify([gs, 'RX relative frequency shift', relshift]), bridge.port, bridge.host);
	udp.send(JSON.stringify([gs, 'TX relative frequency shift', relshift]), bridge.port, bridge.host);
};

const session = sock => {

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
				set_shift(1 - data / ref_freq);
			} else if (TX) {
				ptx = data;
				set_shift(data / ref_freq - 1);
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
	if (!gs) {
		throw new Error('No GS specified');
	}
	console.info('');
	console.info(`TUNE gPredict RX+TX FREQUENCIES TO ${(ref_freq / 1e6).toFixed(6)}MHz!`);
	const server = net.createServer(session);
	await new Promise((res, rej) => server.listen(gpredict.port, gpredict.host, 1, e => e ? rej(e) : res()));
	console.info('');
	console.log(`Server listening on ${gpredict.host}:${gpredict.port}`);
	console.info('');
}

run().catch(err => console.error(`Failed: ${err.stack}`));
