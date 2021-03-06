const express = require('express')
const request = require('request')

const config = require('../config')
const db = require('./db')

let torrentRouter = () => {
	let router = express.Router()
	let baseUrl = 'https://api.t411.li'

	router.post("/auth", (req, res, next) => {
		request({
			url: baseUrl + '/auth',
			method: 'POST',
			form: {
				username: req.body.username,
				password: req.body.password
			},
			json: true
		}, (error, response, json) => {
			if (error) {
				return next(new Error(error))
			}
			if (json.error || !json.token || !json.uid) {
				return next(new Error(`Authentification error (${json.code}): ${json.error}`))
			}
			let user = db.get(req.user, {})
			user.t411 = {
				token: json.token,
				uid: json.uid,
				profile: {}
			}
			db.set(req.user, user)
			res.json({})
		})
	})

	/*
	 * Disconnect user from t411
	 */
	router.delete("/auth", (req, res, next) => {
		let user = db.get(req.user, {})
		user.t411 = {}
		db.set(req.user, user)
		res.json({})
	})

	/*
	 * Update user profile from t411 and stores result in db
	 */

	function profileRefresh(req, res, next) {
		let user = db.get(req.user, {})
		let token = (user.t411 || {}).token || null
		let uid = (user.t411 || {}).uid || null
		if (!token || !uid) {
			return next(new Error('T411 user not authenticated'))
		}
		request({
			url: baseUrl + '/users/profile/' + uid,
			method: 'GET',
			headers: {
				Authorization: token
			},
			json: true
		}, (error, response, json) => {
			if (error) {
				return next(new Error(error))
			}
			if (json.error || !json.username) {
				return next(new Error(`Profile error (${json.code}): ${json.error}`))
			}
			let user = db.get(req.user, {})
			if (!user.t411) {
				user.t411 = {}
			}
			user.t411.profile = json
			db.set(req.user, user)
			res.json(user.t411.profile)
		})
	}
	router.get("/profile/refresh", profileRefresh)

	/*
	 * Returns last user profile stored in db
	 */
	router.get("/profile", (req, res, next) => {
		let user = db.get(req.user, {})
		let token = (user.t411 || {}).token || null
		let uid = (user.t411 || {}).uid || null
		let profile = (user.t411 || {}).profile || null

		if (!token || !uid) {
			return next(new Error('T411 user not authenticated'))
		}
		if (!profile) {
			return profileRefresh(req, res, next)
		} else {
			res.json(profile)
		}
	})

	router.post("/search", (req, res, next) => {
		console.log(db.get(req.user, {}));
		let token = (db.get(req.user, {}).t411 || {}).token || null
		if (!token) {
			return next(new Error('T411 token not found'))
		}
		request({
			url: baseUrl + '/torrents/search/' + encodeURIComponent(req.body.search) + '?limit=100',
			method: 'GET',
			headers: {
				Authorization: token
			},
			form: {
				username: req.body.username,
				password: req.body.password
			},
			json: true
		}, (error, response, json) => {
			if (error) {
				return next(new Error(error))
			}
			if (json.error || !json.torrents) {
				return next(new Error(`Search error (${json.code}): ${json.error}`))
			}
			res.json(json.torrents)
		})
	})

	router.post("/download/:id", (req, res, next) => {
		let token = (db.get(req.user, {}).t411 || {}).token || null
		if (!token) {
			return next(new Error('T411 token not found'))
		}
		request({
			url: baseUrl + '/torrents/download/' + req.params.id,
			method: 'GET',
			headers: {
				Authorization: token
			},
			encoding: null
		}, (error, response, body) => {
			if (error) {
				return next(new Error(error))
			}
			res.json({ base64: body.toString('base64') })
		})
	})

	return router
}

module.exports = torrentRouter
