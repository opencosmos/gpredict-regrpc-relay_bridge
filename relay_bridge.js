#!/usr/bin/env node

const random_id = require('random').chars('0123456789abcdef');
const RegRPCCli = require('regrpccli');

const port = +process.env.PORT_UDP;

const dgram = require('dgram');
const udp = dgram.createSocket('udp6');
udp.bind(port, '::1');

async function run() {
	const name = `gp:${process.env.INSTANCE || random_id(8)}`;
	const regs = await RegRPCCli.create({ name });

	let timer = null;

	regs.client.on('data', msg => {
		if (msg.type === 'NIMI') {
			clearTimeout(timer);
		}
	});

	const invalidate = () => {
		console.error('Watchdog timeout');
		process.exit(1);
	};

	const validate = async () => {
		timer = setTimeout(invalidate, 5000);
		try {
			await regs.client.write({ type: 'KES', local: name, remote: '*', data: Buffer.from('') });
		} catch (e) {
			console.error(e);
			process.exit(1);
		}
	};

	validate();

	process.on('unhandledRejection', err => {
		console.error('Unhandled error');
		console.log(err && err.stack);
		process.exit(1);
	});

	udp.on('message', async (buf, info) => {
		console.info(`[${info.address}]:[${info.port}]`);
		console.log(buf.toString('utf8').replace(/^|\n/g, '$&\t'));
		console.log('');
		try {
			const [gs, key, value] = JSON.parse(buf.toString('utf8'));
			await regs.set(gs, key, value);
		} catch (e) {
			/* Null */
		}
	});
}

run().catch(err => {
	console.error('Failed to start');
	console.log(err && err.stack);
	process.exit(1);
});
