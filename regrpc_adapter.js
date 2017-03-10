const regserver = { host: '::1', port: 49501 };
const regclient_name = process.env.REGCLI_NAME || 'gpredict';
const regrpccli_path = process.env.REGRPCCLI || './regrpccli';

const net = require('net');
const spawn = require('child_process').spawn;

const regrpccli = spawn(regrpccli_path, [regserver.host, regserver.port, regclient_name], { stdio: ['pipe', 1, 2] });

regrpccli.stdin.setEncoding = 'utf-8';
regrpccli.on('close', code => console.log(`regrpccli process exited with code ${code}`));

const bind = { host: '127.0.0.1', port: 6969 };

const regs = {
	_sequence: 0,
	send: (target, data) => {
		const lines = [];
		lines.push(target);
		Object.keys(data).forEach(key => lines.push(`${key}=${data[key]}`));
		const seq = ++regs._sequence;
		lines.push(`Sequence=${seq}`);
		lines.push('SEND');
		const msg = lines.map(s => `${s}\n`).join('');
		regrpccli.stdin.write(msg);
		return seq;
	},
	get: (target, key) => regs.send(target, {
		Command: 'Read',
		Key: key
	}),
	set: (target, key, value) => regs.send(target, {
		Command: 'Write',
		Key: key,
		Value: value
	})
};

const session = sock => {

	let RX = false;
	let TX = false;

	let TX_freq = 435800000;
	let RX_freq = 435800000;

	console.log(`gPredict connection from ${sock.remoteAddress}:${sock.remotePort}`);

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
		if (/^[a-z]/.test(data)) {
			/* gPredict getters dummmy response */
			if (/t/.test(data) && RX) {
				sock.write('0');
			} else if (/t/.test(data) && TX) {
				sock.write('1');
			} else if (/f/.test(data) && RX) {
				sock.write(String(RX_freq));
			} else if (/f/.test(data) && TX) {
				sock.write(String(TX_freq));
			}
		} else if (/^[A-Z]/.test(data)) {
			/* gPredict setters */
			if (/^F/.test(data)) {
				const value = data.match(/\d+/)[0];
				if (RX) {
					regs.set('blue', 'RX frequency', value);
					console.log(`RX <- ${value}`);
				} else if (TX) {
					regs.set('blue', 'TX frequency', value);
					console.log(`TX <- ${value}`);
				}
			}
			/* Acknowledge to gPredict */
			sock.write('RPRT 0');
		}
	});

	sock.on('close', () => console.log(`gPredict conncetion closed from ${sock.remoteAddress}:${sock.remotePort}`));

};

const server = net.createServer(session);

server.listen(bind.port, bind.host);

console.log(`Server listening on ${bind.host}:${bind.port}`);
