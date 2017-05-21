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

RegRPC.create = (...args) => new Promise((res, rej) => {
	const inst = new RegRPC(...args);
	inst.on('open', () => res(inst));
	inst.on('error', err => rej(err));
});

RegRPC.prototype = new EventEmitter();
function RegRPC(options) {
	EventEmitter.call(this);
	const { host, port, name } = _.defaults({}, options, default_opts);

	const sequencer = new Sequencer({ timeout: 5000, seqField: 'seq', resultField: 'result', errorField: 'error', initialValue: (Math.random() * (1 << 26)) | 0 });

	const handle_packet = packet => {
		if (packet.type !== 'RSRS' || packet.local !== name) {
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
		this.emit('response', packet.remote, o);
		if (_.has(o, 'Error')) {
			sequencer.reject({ error: new Error(o.Error), seq: +o.Sequence });
		} else {
			sequencer.resolve({ result: o.Value, seq: +o.Sequence });
		}
	};

	const client = new Client({ server: host, port: port, local: name });
	client.on('open', (...args) => this.emit('open', ...args));
	client.on('close', (...args) => this.emit('close', ...args));
	client.on('info', (...args) => this.emit('info', ...args));
	client.on('error', (...args) => this.emit('error', ...args));
	client.on('data', handle_packet);

	const write = (target, seq, data) => {
		const lines = Object.keys(data).map(key => `${key}=${data[key]}`);
		lines.push(`Sequence=${seq}`);
		const msg = lines.map(s => `${s}\0`).join('');
		client.write({ type: 'RSRQ', local: name, remote: target, data: msg });
	};

	sequencer.on('send', ({ target, data, seq }) => write(target, seq, data));

	this.close = () => {
		client.close();
		sequencer.clear();
	};

	this.send = (target, data, want_reply = true) => {
		if (want_reply) {
			return sequencer.request({ target, data });
		} else {
			write(target, sequencer.next(), data);
			return Promise.resolve();
		}
	};

	this.get = (target, key, want_reply = true) => this.send(target, {
		Command: 'Read',
		Key: key
	}, want_reply);

	this.set = (target, key, value, want_reply = true) => this.send(target, {
		Command: 'Write',
		Key: key,
		Value: value
	}, want_reply);

	this.bind = target => ({
		send: (...args) => this.send(target, ...args),
		write: (...args) => this.write(target, ...args),
		get: (...args) => this.get(target, ...args),
		set: (...args) => this.set(target, ...args),
	});
}
