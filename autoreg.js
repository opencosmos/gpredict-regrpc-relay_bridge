const RegRPC = require('regrpccli');

function Autoreg(...args) {
	let con = null;
	let timer = null;
	const close = () => {
		clearTimeout(timer);
		timer = null;
		if (con) {
			const _con = con;
			con = null;
			_con.close();
		}
	};
	const reconnect = () => {
		close();
		RegRPC.create(...args)
			.then(
				_con => { con = _con; },
				err => {
					console.error('Failed to connect to relay server');
					console.error(err);
					if (!timer) {
						timer = setTimeout(reconnect, 1000);
					}
				});
	};
	const set = (...args2) => {
		if (con) {
			con.set(...args2)
				.catch(err => {
					console.error('Failed to send regrpc command');
					console.error(err);
					console.info('Reconnecting');
					reconnect();
				});
		}
	};
	this.set = set;
	this.close = close;
	reconnect();
}

module.exports = Autoreg;
