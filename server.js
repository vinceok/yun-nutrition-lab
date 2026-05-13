require('dotenv').config()
const express = require('express')
const mysql = require('mysql2/promise')
const cors = require('cors')

const app = express()
app.use(cors()) // 允许跨域（同源部署可省略，但保留无妨）
app.use(express.json())

// 静态文件服务（前端页面）
app.use(express.static('public'))

// 数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
})

// 初始化表结构（自动建表）
;(async () => {
  const createTableSql = `
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
    const conn = await pool.getConnection()
    await conn.execute(createTableSql)
    conn.release()
    console.log('✅ 数据库表已就绪')
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message)
  }
})()

// ================== API 路由 ==================

// 获取所有候选方案
app.get('/api/candidates', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM candidates ORDER BY id ASC')
    res.json(rows)
  } catch (err) {
    res
      .status(500)
      .json({ error: '获取候选方案失败', message: JSON.stringify(err) })
  }
})

// 新增候选方案
app.post('/api/candidates', async (req, res) => {
  const { names, dish_ids, energy, fat } = req.body
  if (!names || !dish_ids || energy === undefined || fat === undefined) {
    return res.status(400).json({ error: '缺少必要字段' })
  }
  try {
    await pool.execute(
      'INSERT INTO candidates (names, dish_ids, energy, fat) VALUES (?, ?, ?, ?)',
      [names, dish_ids, energy, fat]
    )
    res.status(201).json({ message: '创建成功' })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '该方案已存在' })
    }
    res.status(500).json({ error: '保存失败' })
  }
})

// 删除候选方案
app.delete('/api/candidates/:id', async (req, res) => {
  const { id } = req.params
  try {
    const [result] = await pool.execute('DELETE FROM candidates WHERE id = ?', [
      id
    ])
    if (result.affectedRows === 0)
      return res.status(404).json({ error: '方案不存在' })
    res.json({ message: '删除成功' })
  } catch (err) {
    res.status(500).json({ error: '删除失败' })
  }
})

// 投票（原子递增）
app.post('/api/vote', async (req, res) => {
  const { candidate_id, gender } = req.body
  if (!candidate_id || !['male', 'female'].includes(gender)) {
    return res.status(400).json({ error: '参数错误' })
  }
  const column = gender === 'male' ? 'male_votes' : 'female_votes'
  try {
    const [result] = await pool.execute(
      `UPDATE candidates SET ${column} = ${column} + 1 WHERE id = ?`,
      [candidate_id]
    )
    if (result.affectedRows === 0)
      return res.status(404).json({ error: '方案不存在' })
    // 返回更新后的票数（可选）
    const [rows] = await pool.query('SELECT * FROM candidates WHERE id = ?', [
      candidate_id
    ])
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: '投票失败' })
  }
})

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 服务运行在 http://localhost:${PORT}`))
