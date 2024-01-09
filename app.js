"use strict";

// import { BarcodeDetector as BarcodeDetectorPolyfill } from "https://fastly.jsdelivr.net/npm/barcode-detector@2/dist/es/pure.min.js";

let barcode_detector = null
let is_decoding = false
let interval = 0
let camera = null
let overlays = []
let scan_code = 0
let scan_time = 0
let scan_codes = []
const scan_stale = 1000
const overlays_count = 6


init()

async function init() {

	document.querySelector("#download-button").addEventListener("click", download_button_onclick)
	document.querySelector("#capture-button").addEventListener("click", capture_button_onclick)
	document.querySelector("#camera-select").addEventListener("change", camera_select_onchange)
	document.querySelector("#camera").addEventListener("loadeddata", camera_onloadeddata, false)

	camera = document.querySelector("#camera")
	overlays = create_overlays(overlays_count)

	let barcode_detector_supported = false
	if ('BarcodeDetector' in window) {
		let formats = await window.BarcodeDetector.getSupportedFormats()
		if (formats.length > 0) {
			barcode_detector_supported = true
		}
	}

	if (barcode_detector_supported === true) {
		console.log('Barcode Detector supported!')
	}
	else {
		console.log('Barcode Detector is not supported by this browser, using the Dynamsoft Barcode Reader polyfill.')
		window.BarcodeDetector = BarcodeDetectorPolyfill
  	}
  
	barcode_detector = new window.BarcodeDetector()
	enum_devices_and_play()
}


function enum_devices_and_play() {

	const camera_select = document.querySelector("#camera-select")
	camera_select.innerHTML = ""


	navigator.mediaDevices.enumerateDevices().then((devices) => {
		let count = 0
		const device_list = []
		for(const device of devices) {
			if(device.kind == "videoinput") {
				const caps = device.getCapabilities()
				const label = device.label || `Camera ${count}`
				device_list.push({"label": label, "caps": caps, "count": count})
				count++
			}
		}

		device_list.sort((a, b) => {
			const order_a = a.count + (a.caps.facingMode[0] === "environment" ? -100 : 0)
			const order_b = b.count + (b.caps.facingMode[0] === "environment" ? -100 : 0)
			return order_a + order_b
		})

		for(const device of device_list) {
			camera_select.add(new Option(device.label, device.caps.deviceId))
		}

		if(count > 0) {
			play(camera_select.selectedOptions[0].value)
		}
		else {
			alert("No camera detected.")
		}
	});
}


function capture_button_onclick(evt) {
	if(scan_code !== 0) {
		scan_codes.push(scan_code)
	}
}


async function download_button_onclick(evt) {
	// donwload option
	const file = new File(['foo'], 'note.csv', {
		type: 'text/csv',
	})
	// const link = document.createElement('a')
	// const url = URL.createObjectURL(file)

	// link.href = url
	// link.download = file.name
	// document.body.appendChild(link)
	// link.click()

	// document.body.removeChild(link)
	// window.URL.revokeObjectURL(url)

	// share option
	const files = [file]

	if (files.length === 0) {
		console.log("No files selected.")
		return
	}
  
	// feature detecting navigator.canShare() also implies
	// the same for the navigator.share()
	if (!navigator.canShare) {
		console.log("Your browser doesn't support the Web Share API.")
		return
	}
  
	if (navigator.canShare({files})) {
		try {
			await navigator.share({
				files,
				title: "Images",
				text: "Beautiful images",
			})
			console.log("Shared!")
		} 
		catch (error) {
			console.log(`Error: ${error.message}`)
		}
	} 
	else {
		console.log(`Your system doesn't support sharing these files.`)
	}

}


function camera_select_onchange(evt){
	document.querySelector("#status")
	const camera_select = evt.currentTarget
	const device_id = camera_select.selectedOptions[0].value
	play(device_id);
}


function camera_onloadeddata() {

	const svg = document.querySelector("#overlay")
	svg.setAttribute("viewBox",`0 0 ${window.innerWidth} ${camera.videoHeight}`)
	svg.style.width = `${window.innerWidth}px`
	svg.style.height = `${camera.videoHeight}px`

	clearInterval(interval);
	// 1000/30=33 or 1000/20=50
	interval = setInterval(decode, 50);
	console.log("loaded")
}


function play(device_id) {
	stop()
	const constraints = { video: {deviceId: device_id} }

	navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
		camera.srcObject = stream
		console.log(camera.videoWidth, camera.videoHeight)
	}).catch((err) => {
		console.error('getUserMediaError', err, err.stack)
	});
}


function stop(){
	clearInterval(interval);

	try{
		if (camera.srcObject){
			camera.srcObject.getTracks().forEach(track => track.stop());
		}
	} catch (e){
		alert(e.message);
	}
}


async function decode() {

	if (is_decoding === true) return;

	is_decoding = true
	const barcodes = await barcode_detector.detect(camera)
	update_overlays(barcodes)

	if(barcodes.length > 0) {
		scan_code = barcodes[0].rawValue
		scan_time = Date.now()
	}
	else if(Date.now() - scan_time > scan_stale) {
		scan_code = 0
	}
	document.querySelector(".data > #list").innerHTML = "<li>" + scan_codes.join("</li><li>") + "</li>"

	is_decoding = false
}


function update_overlays(barcodes) {

	let overlay_index = 0
	for (const barcode of barcodes) {

		if(overlay_index >= overlays.length) break

		const overlay = overlays[overlay_index]

		const p = barcode.cornerPoints
		const points = `${p[0].x},${p[0].y} ${p[1].x},${p[1].y} ${p[2].x},${p[2].y} ${p[3].x},${p[3].y}`

		overlay.polygon.setAttribute("points", points)
		
		let pts = [p[0], p[1], p[2], p[3]]
		pts.sort((a, b) => (a.y - b.y) - (b.x - a.x))
		const pt = pts[0]

		overlay.text.innerHTML = barcode.rawValue
		overlay.text.setAttribute("x", pt.x)
		overlay.text.setAttribute("y", pt.y - 5)
		
		const bbox = overlay.text.getBoundingClientRect()
		overlay.rect.setAttribute("x", pt.x)
		overlay.rect.setAttribute("y", pt.y - bbox.height)
		overlay.rect.setAttribute("width", bbox.width)
		overlay.rect.setAttribute("height", bbox.height)

		overlay_index++
	}

	for(let i=overlay_index; i<overlays_count; i++) {
		const overlay = overlays[overlay_index]
		if(overlay.text.getAttribute("x") !== -9999) {
			overlay.polygon.setAttribute("points", "")
			overlay.rect.setAttribute("x", -9999)
			overlay.text.setAttribute("x", -9999)
		}
	}
}

function create_overlays(count) {

	const overlays = []
	const overlays_svg = document.querySelector("#overlay")

	for (let i=0; i<count; i++) {

		const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon")
		polygon.setAttribute("points", "")
		polygon.setAttribute("class", "barcode-polygon")

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
		rect.setAttribute("class", "barcode-rect")
		rect.setAttribute("x", -9999)
		rect.setAttribute("y", 0)

		const text = document.createElementNS("http://www.w3.org/2000/svg", "text")
		text.setAttribute("class", "barcode-text")
		text.setAttribute("x", -9999)
		text.setAttribute("y", 0)

		const overlay = { "polygon": polygon, "rect": rect, "text": text }
		overlays.push(overlay)
		overlays_svg.append(polygon)
		overlays_svg.append(rect)
		overlays_svg.append(text)
	}

	return overlays
}