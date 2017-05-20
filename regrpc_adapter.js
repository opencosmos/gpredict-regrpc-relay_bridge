#!/usr/bin/env node

const RegRPC = require('./regrpc');

const gs = process.env.GS;

if (!gs) {
	console.error('No GS specified');
	process.exit(1);
}

const net = require('net');

const gpredict = { host: '127.0.0.1', port: process.env.PORT || 6969 };

const random_id = require('random').chars('0123456789abcdef');

const regs = new RegRPC({ name: 'gp:' + random_id(4) });

const session = (sock, rx_freq, tx_freq) => {

	let RX = false;
	let TX = false;

	console.log(`gPredict connection from ${sock.remoteAddress}:${sock.remotePort}`);

	const err = msg => error => console.error(`Failed to ${msg}: ${error.stack}`);

	sock.on('data', rawdata => {

		const data = rawdata.toString('utf8');
		// console.log(`gPredict data from ${sock.remoteAddress}: ${JSON.stringify(data)}`);

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
		console.log('------------');
		console.log(data);
		console.log('------------');
		if (/^[a-z]/.test(data)) {
			/* gPredict getters dummmy response */
			if (/t/.test(data) && RX) {
				sock.write('0');
			} else if (/t/.test(data) && TX) {
				sock.write('1');
			} else if (/f/.test(data) && RX) {
				sock.write(String(rx_freq));
			} else if (/f/.test(data) && TX) {
				sock.write(String(tx_freq));
			}
		} else if (/^[A-Z]/.test(data)) {
			/* gPredict setters */
			if (/^F/.test(data)) {
				const value = data.match(/\d+/)[0];
				if (RX) {
					const shift = value - rx_freq;
					regs.set(gs, 'RX frequency shift', shift)
						.then(
							() => console.info(`RX <- ${rx_freq} + ${shift}`),
							err('set RX frequency shift'));
				} else if (TX) {
					const shift = value - tx_freq;
					regs.set(gs, 'TX frequency shift', shift)
						.then(
							() => console.info(`TX <- ${tx_freq} + ${shift}`),
							err('set TX frequency shift'));
				}
			}
			/* Acknowledge to gPredict */
			sock.write('RPRT 0');
		}
	});

	sock.on('close', () => console.log(`gPredict conncetion closed from ${sock.remoteAddress}:${sock.remotePort}`));

};

regs.on('open', () => Promise.all([regs.get(gs, 'RX frequency'), regs.get(gs, 'TX frequency')])
	.then(([rx, tx]) => {
		console.info(`rx=${rx} tx=${tx}`);
		const server = net.createServer(socket => session(socket, rx, tx));
		server.listen(gpredict.port, gpredict.host);
		console.log(`Server listening on ${gpredict.host}:${gpredict.port}`);
	}));
