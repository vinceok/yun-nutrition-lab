require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 15000,
  max: 5
})

// 建表（注意语法差异）
;(async () => {
  const createTable = `
    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      names VARCHAR(200) NOT NULL,
      dish_ids VARCHAR(50) NOT NULL UNIQUE,
      energy INT NOT NULL,
      fat INT NOT NULL,
      male_votes INT DEFAULT 0,
      female_votes INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `
  try {
    await pool.query(createTable)
    console.log('✅ PostgreSQL 表已就绪')
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message)
  }
})()

// API 路由（注意占位符 $1 而非 ?）
app.get('/api/candidates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM candidates ORDER BY id ASC')
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/candidates', async (req, res) => {
  const { names, dish_ids, energy, fat } = req.body
  try {
    await pool.query(
      'INSERT INTO candidates (names, dish_ids, energy, fat) VALUES ($1, $2, $3, $4)',
      [names, dish_ids, energy, fat]
    )
    res.status(201).json({ message: '创建成功' })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '方案已存在' })
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/candidates/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM candidates WHERE id = $1', [
      req.params.id
    ])
    if (result.rowCount === 0) return res.status(404).json({ error: '不存在' })
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
    // PostgreSQL 不支持动态列名？我们直接字符串拼接但使用参数化防止注入
    const updateResult = await pool.query(
      `UPDATE candidates SET ${column} = ${column} + 1 WHERE id = $1 RETURNING *`,
      [candidate_id]
    )
    if (updateResult.rowCount === 0)
      return res.status(404).json({ error: '不存在' })
    res.json(updateResult.rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 服务运行在端口 ${PORT}`))
