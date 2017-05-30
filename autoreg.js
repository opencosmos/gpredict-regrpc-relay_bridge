const RegRPC = require('regrpccli');

function Autoreg(...args) {
	let con = null;
	const close = () => {
		if (con) {
			const _con = con;
			con = null;
			_con.close();
		}
	};
	const reconnect = () => {
		close();
		RegRPC.create(...args).then(_con => { con = _con; });
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
}

module.exports = Autoreg;
