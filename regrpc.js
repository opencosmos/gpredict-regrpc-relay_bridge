const _ = require('lodash');
const Sequencer = require('sequencer');
const Client = require('relay/client');
const EventEmitter = require('eventemitter');

module.exports = RegRPC;

const default_opts = {
	name: process.env.REGCLI_NAME || 'test',
	host: '::1',
	port: 49501
};

RegRPC.prototype = new EventEmitter();
function RegRPC(options) {
	EventEmitter.call(this);
	const { host, port, name } = _.defaults({}, options, default_opts);
	const sequencer = new Sequencer({ timeout: 5000, seqField: 'seq', resultField: 'result', errorField: 'error', initialValue: (Math.random() * (1 << 26)) | 0 });
	const client = new Client({ server: host, port: port, local: name });
	client.on('open', (...args) => this.emit('open', ...args));
	client.on('close', (...args) => this.emit('close', ...args));
	client.on('info', (...args) => this.emit('info', ...args));
	client.on('error', (...args) => this.emit('error', ...args));
	sequencer.on('send', ({ target, data, seq }) => {
		const lines = Object.keys(data).map(key => `${key}=${data[key]}`);
		lines.push(`Sequence=${seq}`);
		const msg = lines.map(s => `${s}\0`).join('');
		client.write({ type: 'RSRQ', local: name, remote: target, data: msg });
		lines.forEach(l => console.log(`>${target}: ${l}`));
		console.log('');
	});
	client.on('data', packet => {
		if (packet.type !== 'RSRS') {
			return;
		}
		const msg = packet.data.toString('utf8').split('\0');
		const o = _(msg)
			.filter(x => x)
			.map(s => {
				const m = s.match(/^([^=]+)=(.*)$/);
				if (!m) {
					console.warn('Invalid keyval');
					console.log(s);
					return null;
				}
				return [m[1], m[2]];
			})
			.filter(x => x)
			.fromPairs()
			.value();
		if (!_.has(o, 'Sequence')) {
			console.warn('No sequence number in response');
			return;
		}
		if (_.has(o, 'Error')) {
			sequencer.reject({ error: new Error(o.Error), seq: +o.Sequence });
		} else {
			sequencer.resolve({ result: o.Value, seq: +o.Sequence });
		}
	});

	this.close = () => {
		client.close();
		sequencer.clear();
	};

	this.send = (target, data) => sequencer.request({ target, data });

	this.get = (target, key) => this.send(target, {
		Command: 'Read',
		Key: key
	});

	this.set = (target, key, value) => this.send(target, {
		Command: 'Write',
		Key: key,
		Value: value
	});
}

