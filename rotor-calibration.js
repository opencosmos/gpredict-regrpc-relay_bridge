const net = require('net');

const controller = { host: '::1', port: 4533 };
const predictor = { host: '::1', port: 3533 };

const no_controller = !!process.env.no_controller;

/*
 * File with calibration values taken experimentally
 *
 * Used for translation from real value to desired value using JSON file in order to cheat GPredict
 */
const calibration = require('./calibrationParameters.json');

/* Client to communicate with hamlib */
const client = no_controller ? null : new net.Socket();

if (!no_controller) {
	client.connect(controller.port, controller.host, () => console.log('Controller connected'));
}

process.on('SIGINT', () => {
	if (!no_controller) {
		/* Close the client socket */
		client.destroy();
	}
	process.exit();
});

const send_to_controller = cmd => {
	if (!no_controller) {
		client.write(cmd);
	}
	console.log(`Sent to controller: ${JSON.stringify(cmd)}`);
};

let end_previous;

/* gPredict server connection handler */
const session = sock => {

	/* Close any previous gpredict connection */
	if (end_previous) {
		end_previous();
	}
	end_previous = () => {
		if (!no_controller) {
			client.removeAllListeners();
		}
		sock.removeAllListeners();
		sock.close();
	};

	console.log(`gpredict connected on ${sock.remoteAddress}:${sock.remotePort}`);

	let azel = '0\n1';

	const send_to_predict = data => {
		sock.write(data);
		console.log(`Sent to gpredict: ${JSON.stringify(data)}`);
	};

	/* Data from rotator */
	const on_controller_data = rawdata => {

		const data = rawdata.toString('utf8');
		console.log(`Received from controller: ${data}`);

		/* If blocks in order to handle different obtained answers fromw hamlib */
		if (data.match(/^([\w-]+)/)[0] === 'get_pos' || !/^[a-zA-Z]/.test(data)) {
			const read_az = parseInt(data.match(/[0-9]*\.?[0-9]+/g)[0], 10);
			const az = calibration.desired[calibration.real.indexOf(read_az)];
			const el = data.match(/[0-9]*\.?[0-9]+/g)[1];
			console.log(`azel=(${az}, ${el})`);
			azel = `${az}\n${el}`;
		} else {
			console.error('Unhandled Command from Controller');
		}

	};

	/* Data from gpredict */
	const on_gpredict_data = rawdata => {
		const data = rawdata.toString('utf8');

		console.log(`Received from gpredict: ${data}`);

		if (/^[a-z]/.test(data)) {
			/* Lowercase commands or getters */
			if (/p/.test(data)) {
				send_to_controller('p');
				send_to_predict(azel);
			}
		} else if (/^[A-Z]/.test(data)) {
			/* Uppercase commands or setters */
			if (/^P/.test(data)) {
				const desired_az = parseInt(data.match(/[0-9]*\.?[0-9]+/g)[0], 10);
				const real_az = calibration.real[calibration.desired.indexOf(desired_az)];
				const real_el = data.match(/[0-9]*\.?[0-9]+/g)[1];
				send_to_controller(`P ${real_az} ${real_el}`);
				/* Return of Successfully Sent Command */
				send_to_predict('RPRT 0');
			} else {
				console.error(`Unhandled Command: ${JSON.stringify(data)}`);
			}
		}

	};

	if (!no_controller) {
		client.on('data', on_controller_data);
	}

	sock.on('data', on_gpredict_data);

	/* Add a 'close' event handler to this instance of socket */
	sock.on('close', () => {
		console.log(`gpredict connection closed for ${sock.remoteAddress} ${sock.remotePort}`);
	});

};

const server = net.createServer(session);

server.listen(predictor.port, predictor.host);

console.log(`Waiting for gpredict to connect on ${predictor.host}:${predictor.port}`);
