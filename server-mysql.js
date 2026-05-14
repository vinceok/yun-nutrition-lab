require('dotenv').config()
const express = require('express')
const mysql = require('mysql2/promise')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  acquireTimeout: 15000
})

// 建表
;(async () => {
  const createTable = `
    CREATE TABLE IF NOT EXISTS candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      names VARCHAR(200) NOT NULL,
      dish_ids VARCHAR(50) NOT NULL UNIQUE,
      energy INT NOT NULL,
      fat INT NOT NULL,
      male_votes INT DEFAULT 0,
      female_votes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  try {
    await pool.query(createTable)
    console.log('✅ MySQL 表已就绪')
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message)
  }
})()

// API 路由
app.get('/api/candidates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM candidates ORDER BY id ASC')
    res.json(result[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/candidates', async (req, res) => {
  const { names, dish_ids, energy, fat } = req.body
  try {
    await pool.query(
      'INSERT INTO candidates (names, dish_ids, energy, fat) VALUES (?, ?, ?, ?)',
      [names, dish_ids, energy, fat]
    )
    res.status(201).json({ message: '创建成功' })
  } catch (e) {
    if (e.errno === 1062) return res.status(409).json({ error: '方案已存在' }) // MySQL 重复键错误码
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/candidates/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM candidates WHERE id = ?', [
      req.params.id
    ])
    if (result[0].affectedRows === 0)
      return res.status(404).json({ error: '不存在' })
    res.json({ message: '删除成功' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM candidates')
    res.json({ message: '数据库已重置' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/vote', async (req, res) => {
  const { candidate_id, gender } = req.body
  const column = gender === 'male' ? 'male_votes' : 'female_votes'
  try {
    const updateResult = await pool.query(
      `UPDATE candidates SET ?? = ?? + 1 WHERE id = ?`,
      [column, column, candidate_id]
    )
    if (updateResult[0].affectedRows === 0)
      return res.status(404).json({ error: '不存在' })

    // 获取更新后的记录
    const getResult = await pool.query(
      'SELECT * FROM candidates WHERE id = ?',
      [candidate_id]
    )
    res.json(getResult[0][0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 服务运行在端口 ${PORT}`))
