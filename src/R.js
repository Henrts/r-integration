const fs = require("fs");
const pt = require("path");
const events = require('events');
var child_process = require("child_process");


/**
 * Get the current Operating System name
 * 
 * @returns {string} the operating system short name 
 *  - "win" -> for Windows based Systems
 *  - "lin" -> for GNU/Linux based Systems
 *  - "mac" -> for MacOS based Systems
 */
getCurrentOs = () => {
	var processPlatform = process.platform;
	var currentOs;

	if (processPlatform === "win32") {
		currentOs = "win";
	} else if (processPlatform === "linux" || processPlatform === "openbsd" || processPlatform === "freebsd") {
		currentOs = "lin";
	} else {
		currentOs = "mac"
	}

	return currentOs;
};


/**
 * Execute a command in the OS shell (used to execute R command)
 * 
 * @param {string} command the command to execute
 * @param {String[]} args an array of parameters to be passed to the command
 * @returns {{string, string}} the command execution result
 */
 executeShellCommand = (command, args) => {
	let stdout;
	let stderr;

	let exec_res = child_process.spawnSync(command, args, { encoding : 'utf8' });
	stdout = exec_res.stdout;
	stderr = exec_res.stderr;

	return {
		stdout,
		stderr
	};
};


/**
 * Execute a command in the OS shell (used to execute R command) asynchronously 
 *
 * @param {string} command the command to execute
 * @param {String[]} args an array of parameters to be passed to the command
 * @returns {Promise<string>} the command execution result
 */
 executeShellCommandAsync = (command, args, emitter) => {

	return new Promise((resolve, reject) => {
		var stdout = "";
		var stderr = "";

		let process = child_process.spawn(command, args, { encoding : 'utf8' });

		process.stdout.on('data', (data) => {		
			data=data.toString();
			if(data.indexOf("progress-") !== -1 && emitter) {
				const [_, progress, pct] = data.replaceAll('"', '').trim().split("-")
				emitter.emit("progress", progress + (pct ? '-' + pct : ''))
			}
			stdout+=data;
		});
		
		process.stderr.on('data', (data) => {		
			data=data.toString();
			if(data.indexOf("progress-") !== -1) {
				console.log(data)
			}
			stderr+=data;
		});
		

		process.on('exit', (code) => {
			if (code !== 0) {
				reject(command + " " + args.join(" ") + " exited with code " + code + " and error: " + stderr);
			} else {
				resolve(stdout);
			}
		});
		
	});
};

/**
 * Check if Rscript(R) is installed od the system and returns the path where the
 * binary is installed
 *
 * @param {string} path alternative path to use as binaries directory
 * @returns {string} the path where the Rscript binary is installed, 0 otherwise
 */
isRscriptInstallaed = (path) => {
	var installationDir = 0;

	switch (getCurrentOs()) {
		case "win":
			if (!path) {
				path = pt.join("C:\\Program Files\\R");
			}

			if (fs.existsSync(path)) {
				// Rscript is installed, let's find the path (version problems)

				let dirContent = fs.readdirSync(path);
				if (dirContent.length != 0) {
					let lastVersion = dirContent[dirContent.length - 1];
					installationDir = pt.join(path, lastVersion, "bin", "Rscript.exe");
				}
			}
			break;
		case "mac":
		case "lin":
			if (!path) {
				// the command "which" is used to find the Rscript installation
				// directory
				path = executeShellCommand("which", ["Rscript"]).stdout;
				if (path) {
					// Rscript is installed
					installationDir = path.replace("\n", "");
				}
			} else {
				path = pt.join(path, "Rscript");
				if (fs.existsSync(path)) {
					//file Rscript exists
					installationDir = path;
				}
			}

			break;
		default:
			break;
	}

	return installationDir;
};

/**
 * Execute in R a specific one line command
 *
 * @param {string} command the single line R command
 * @param {string} RBinariesLocation optional parameter to specify an
 * alternative location for the Rscript binary
 * @returns {String[]} an array containing all the results from the command
 * execution output, 0 if there was an error
 */
executeRCommand = (command, RBinariesLocation) => {
	let RscriptBinaryPath = isRscriptInstallaed(RBinariesLocation);
	let output = 0;

	if (RscriptBinaryPath) {
		var args = ["-e", command];
		var commandResult = executeShellCommand(RscriptBinaryPath, args);
		console.log("Command Result", commandResult.stdout)
		if (commandResult.stdout) {
			output = commandResult.stdout;
			output = filterMultiline(output);
		} else {
			throw Error(`[R: compile error] ${commandResult.stderr}`);
		}

	} else {
		throw Error("R not found, maybe not installed.\nSee www.r-project.org");
	}

	return output;
};

/**
 * Execute in R a specific one line command - asynchronously
 *
 * @param {string} command the single line R command
 * @param {string} RBinariesLocation optional parameter to specify an
 * alternative location for the Rscript binary
 * @returns {Promise<string>} an array containing all the results from the command
 * execution output, null if there was an error
 */
executeRCommandAsync = (command, RBinariesLocation, emitter) => {
	return new Promise(function(resolve, reject) {

		let RscriptBinaryPath = isRscriptInstallaed(RBinariesLocation);

		if (RscriptBinaryPath) {
			var args = ["-e", command];
			executeShellCommandAsync(RscriptBinaryPath, args, emitter).then((output) => {
				output = filterMultiline(output);
				resolve(output);
			}).catch((stderr) => {
				reject(`[R: compile error] ${stderr}`);
			});

		} else {
			reject("R not found, maybe not installed.\nSee www.r-project.org");
		}	

	});
};

/**
 * Execute in R all the commands in the file specified by the parameter
 * fileLocation.
 *
 * NOTE: the function reads only variables printed to stdout by the cat() or
 * print() function. It is recommended to use the print() function insted of the
 * cat() to avoid line break problem. If you use the cat() function remember to
 * add the newline character "\n" at the end of each cat: for example cat(" ...
 * \n")
 *
 * @param {string} fileLocation where the file to execute is stored
 * @param {string} RBinariesLocation optional parameter to specify an
 * alternative location for the Rscript binary
 * @returns {String[]} an array containing all the results from the command
 * execution output, 0 if there was an error
 */
executeRScript = (fileLocation, RBinariesLocation) => {

	let RscriptBinaryPath = isRscriptInstallaed(RBinariesLocation);
	let output = 0;

	if (!fs.existsSync(fileLocation)) {
		//file doesn't exist
		throw Error(`ERROR: the file "${fileLocation}" doesn't exist`);
	}

	if (RscriptBinaryPath) {
		var commandResult = executeShellCommand(RscriptBinaryPath, [fileLocation]);

		if (commandResult.stdout) {
			output = commandResult.stdout;
			output = filterMultiline(output);
		} else {
			throw Error(`[R: compile error] ${commandResult.stderr}`);
		}

	} else {
		throw Error("R not found, maybe not installed.\nSee www.r-project.org");
	}

	return output;

};

/**
 * Formats the parameters so that R could read them
 * 
 * @param {Object} params an array of parameters
 * @returns {string} the parameters formatted in the proper way
 */
convertParamsArray = (params) => {
	var methodSyntax = ``;

	if (Array.isArray(params)) {
		methodSyntax += "c(";

		for (let i = 0; i < params.length; i++) {
			methodSyntax += convertParamsArray(params[i]);
		}

		methodSyntax = methodSyntax.slice(0, -1);
		methodSyntax += "),";
	} else if (typeof params == "string") {
		methodSyntax += `'${params}',`;
	} else if (params == undefined) {
		methodSyntax += `NA,`;
	} else {
		methodSyntax += `${params},`;
	}

	return methodSyntax;
};


/**
 * Calls a R function located in an external script with parameters and returns
 * the result
 *
 * @param {string} fileLocation where the file containing the function is stored
 * @param {string} methodName the name of the method to execute
 * @param {Object} params an object containing a binding between parameter names
 * and value to pass to the function or an array 
 * @param {string} RBinariesLocation optional parameter to specify an
 * alternative location for the Rscript binary
 * @returns {string} the execution output of the function, 0 in case of error
 */
callMethod = (fileLocation, methodName, params, RBinariesLocation) => {
	let output = 0;

	if (!methodName || !fileLocation || !params) {
		throw Error("ERROR: please provide valid parameters - methodName, fileLocation and params cannot be null");
	}

	var methodSyntax = `${methodName}(`;

	// check if params is an array of parameters or an object
	if (Array.isArray(params)) {
		methodSyntax += convertParamsArray(params);
	} else {
		for (const [key, value] of Object.entries(params)) {
			if (Array.isArray(value)) {
				methodSyntax += `${key}=${convertParamsArray(value)}`;
			} else if (typeof value == "string") {
				methodSyntax += `${key}='${value}',`; // string preserve quotes
			} else if (value == undefined) {
				methodSyntax += `${key}=NA,`;
			} else {
				methodSyntax += `${key}=${value},`;
			}
		}
	}

	var methodSyntax = methodSyntax.slice(0, -1);
	methodSyntax += ")";

	output = executeRCommand(`source('${fileLocation}') ; print(${methodSyntax})`, RBinariesLocation);

	return output;
};

/**
 * Calls a R function with parameters and returns the result - async
 *
 * @param {string} fileLocation where the file containing the function is stored
 * @param {string} methodName the name of the method to execute
 * @param {String []} params a list of parameters to pass to the function
 * @param {EventEmitter} emitter an event emitter to track function progress
 * @param {string} RBinariesLocation optional parameter to specify an
 * alternative location for the Rscript binary
 * @returns {Promise<string>} the execution output of the function
 */
callMethodAsync = (fileLocation, methodName, params, emitter, RBinariesLocation) => {
	return new Promise(function(resolve, reject) {

		if (!methodName || !fileLocation || !params) {
			throw Error("ERROR: please provide valid parameters - methodName, fileLocation and params cannot be null");
		}

		var methodSyntax = `${methodName}(`;

		// check if params is an array of parameters or an object
		if (Array.isArray(params)) {
			methodSyntax += convertParamsArray(params);
		} else {
			for (const [key, value] of Object.entries(params)) {
				if (Array.isArray(value)) {
					methodSyntax += `${key}=${convertParamsArray(value)}`;
				} else if (typeof value == "string") {
					methodSyntax += `${key}='${value}',`; // string preserve quotes
				} else if (value == undefined) {
					methodSyntax += `${key}=NA,`;
				} else {
					methodSyntax += `${key}=${value},`;
				}
			}
		}

		var methodSyntax = methodSyntax.slice(0, -1);
		methodSyntax += ")";

		executeRCommandAsync(`source('${fileLocation}') ; print(${methodSyntax})`, RBinariesLocation, emitter).then((res) => {
			resolve(res);
		}).catch((error) => {
			reject(`${error}`);
		});

	})
};


/**
 * Calls a standard R function with parameters and returns the result
 *
 * @param {string} methodName the name of the method to execute
 * @param {Object} params an object containing a binding between parameter names
 * and value to pass to the function or an array 
 * @param {string} RBinariesLocation optional parameter to specify an
 * alternative location for the Rscript binary
 * @returns {string} the execution output of the function, 0 in case of error
 */
callStandardMethod = (methodName, params, RBinariesLocation) => {
	let output = 0;

	if (!methodName || !params) {
		throw Error("ERROR: please provide valid parameters - methodName and params cannot be null");
	}

	var methodSyntax = `${methodName}(`;

	// check if params is an array of parameters or an object
	if (Array.isArray(params)) {
		methodSyntax += convertParamsArray(params);
	} else {
		for (const [key, value] of Object.entries(params)) {
			if (Array.isArray(value)) {
				methodSyntax += `${key}=${convertParamsArray(value)}`;
			} else if (typeof value == "string") {
				methodSyntax += `${key}='${value}',`; // string preserve quotes
			} else if (value == undefined) {
				methodSyntax += `${key}=NA,`;
			} else {
				methodSyntax += `${key}=${value},`;
			}
		}
	}

	var methodSyntax = methodSyntax.slice(0, -1);
	methodSyntax += ")";

	output = executeRCommand(`print(${methodSyntax})`, RBinariesLocation);

	return output;
};


/**
 * Filters the multiline output from the executeRcommand and executeRScript
 * functions using regular expressions
 *
 * @param {string} commandResult the multiline result of RScript execution
 * @returns {String[]} an array containing all the results 
 */
filterMultiline = (commandResult) => {
	let data;

	// remove last newline to avoid empty results NOTE: windows newline is
	// composed by \r\n, GNU/Linux and Mac OS newline is \n
	var currentOS = getCurrentOs();

	commandResult = commandResult.replace(/\[\d+\] /g, "");

	if (currentOS == "win") {
		commandResult = commandResult.replace(/\t*\s*[\r\n]*$/g, "");
		commandResult = commandResult.replace(/[\s\t]+/g, "\r\n");

	} else {

		commandResult = commandResult.replace(/\t*\s*\n*$/g, "");
		commandResult = commandResult.replace(/[\s\t]+/g, "\n");
	}

	// check if data is JSON parsable
	try {
		data = [JSON.parse(commandResult)];
	} catch (e) {
		// the result is not json parsable -> split
		if (currentOS == "win") {
			data = commandResult.split(/[\r\n]+/)
		} else {
			data = commandResult.split(/[\n]+/)
		}

		// find undefined or NaN and remove quotes
		for (let i = 0; i < data.length; i++) {
			if (data[i] == "NA") {
				data[i] = undefined;
			} else if (data[i] == "NaN") {
				data[i] = NaN;
			} else {
				data[i] = data[i].replace(/\"/g, "")
			}

		}

	}


	return data;
};

module.exports = {
	executeRCommand,
	executeRCommandAsync,
	executeRScript,
	callMethod,
	callMethodAsync,
	callStandardMethod
}