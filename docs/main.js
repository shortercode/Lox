function setup () {
	const tabber = document.querySelector(".tabber");
	const workspace = document.querySelector(".workspace");
	
	const codeTab = tabber.children[0];
	const astTab = tabber.children[1];
	const consoleTab = tabber.children[2];
	const aboutTab = tabber.children[3];
	
	const codePane = workspace.children[0];
	const astPane = workspace.children[1];
	const consolePane = workspace.children[2];
	const aboutPane = workspace.children[3];
	
	let active = "";
	
	function swap (name) {
		if (active === name)
			return;
		active = name;
		codeTab.classList.remove("active");
		astTab.classList.remove("active");
		consoleTab.classList.remove("active");
		aboutTab.classList.remove("active");
		
		hide(codePane);
		hide(astPane);
		hide(consolePane);
		hide(aboutPane);
		
		switch (name) {
			case "code":
				codeTab.classList.add("active");
				show(codePane);
				break;
			case "ast":
				astTab.classList.add("active");
				show(astPane);
				updateAST();
				break;
			case "console":
				consoleTab.classList.add("active");
				show(consolePane);
				updateConsole();
				break;
			case "about":
				aboutTab.classList.add("active");
				show(aboutPane);
				break;
		}
	}
	
	on(codeTab, "click", _ => swap("code"));
	on(astTab, "click", _ => swap("ast"));
	on(consoleTab, "click", _ => swap("console"));
	on(aboutTab, "click", _ => swap("about"));
	
	swap("about");
}

function hide (el) {
	el.style.display = "none";
}
function show (el) {
	el.style.display = "";
}
function on (eventSource, name, fn) {
	eventSource.addEventListener(name, fn);
}

function updateAST () {
	
}

function updateConsole () {
	
}

setup();
