const RegRPC = require('regrpccli');

function Autoreg(...con_args) {
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
		RegRPC.create(...con_args)
			.then(_con => { con = _con; })
			.catch(err => {
				console.error('Failed to connect to relay server');
				console.error(err);
				close();
				if (!timer) {
					timer = setTimeout(reconnect, 1000);
				}
			});
	};
	const set = (...args) => {
		if (con) {
			con.set(...args)
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
