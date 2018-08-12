import "jest-dom/extend-expect"
import React from "react"
import { render, fireEvent, cleanup, waitForElement } from "react-testing-library"
import Async from "./"

afterEach(cleanup)

const resolveIn = ms => value => new Promise(resolve => setTimeout(() => resolve(value), ms))
const resolveTo = resolveIn(0)
const rejectIn = ms => err => new Promise((resolve, reject) => setTimeout(() => reject(err), ms))
const rejectTo = rejectIn(0)

test("runs promiseFn on mount", () => {
  const promiseFn = jest.fn().mockReturnValue(Promise.resolve())
  render(<Async promiseFn={promiseFn} />)
  expect(promiseFn).toHaveBeenCalledTimes(1)
})

test("passes resolved data to children as render prop", async () => {
  const promiseFn = () => resolveTo("done")
  const { getByText } = render(<Async promiseFn={promiseFn}>{({ data }) => data || null}</Async>)
  await waitForElement(() => getByText("done"))
})

test("passes rejection error to children as render prop", async () => {
  const promiseFn = () => Promise.reject("oops")
  const { getByText } = render(<Async promiseFn={promiseFn}>{({ error }) => error || null}</Async>)
  await waitForElement(() => getByText("oops"))
})

test("passes isLoading boolean while the promise is running", async () => {
  const promiseFn = () => resolveTo("done")
  const states = []
  const { getByText } = render(
    <Async promiseFn={promiseFn}>
      {({ data, isLoading }) => {
        states.push(isLoading)
        return data || null
      }}
    </Async>
  )
  await waitForElement(() => getByText("done"))
  expect(states).toEqual([false, true, false])
})

test("passes startedAt date when the promise starts", async () => {
  const promiseFn = () => resolveTo("done")
  const { getByText } = render(
    <Async promiseFn={promiseFn}>
      {({ startedAt }) => {
        if (startedAt) {
          expect(startedAt.getTime()).toBeCloseTo(new Date().getTime(), -2)
          return "started"
        }
        return null
      }}
    </Async>
  )
  await waitForElement(() => getByText("started"))
})

test("passes finishedAt date when the promise finishes", async () => {
  const promiseFn = () => resolveTo("done")
  const { getByText } = render(
    <Async promiseFn={promiseFn}>
      {({ data, finishedAt }) => {
        if (finishedAt) {
          expect(finishedAt.getTime()).toBeCloseTo(new Date().getTime(), -1)
          return data
        }
        return null
      }}
    </Async>
  )
  await waitForElement(() => getByText("done"))
})

test("passes reload function that re-runs the promise", () => {
  const promiseFn = jest.fn().mockReturnValue(resolveTo())
  const { getByText } = render(
    <Async promiseFn={promiseFn}>
      {({ reload }) => {
        return <button onClick={reload}>reload</button>
      }}
    </Async>
  )
  expect(promiseFn).toHaveBeenCalledTimes(1)
  fireEvent.click(getByText("reload"))
  expect(promiseFn).toHaveBeenCalledTimes(2)
})

test("re-runs the promise when the value of 'watch' changes", () => {
  class Counter extends React.Component {
    state = { count: 0 }
    inc = () => this.setState(state => ({ count: state.count + 1 }))
    render() {
      return (
        <div>
          <button onClick={this.inc}>increment</button>
          {this.props.children(this.state.count)}
        </div>
      )
    }
  }
  const promiseFn = jest.fn().mockReturnValue(resolveTo())
  const { getByText } = render(<Counter>{count => <Async promiseFn={promiseFn} watch={count} />}</Counter>)
  expect(promiseFn).toHaveBeenCalledTimes(1)
  fireEvent.click(getByText("increment"))
  expect(promiseFn).toHaveBeenCalledTimes(2)
  fireEvent.click(getByText("increment"))
  expect(promiseFn).toHaveBeenCalledTimes(3)
})

test("runs deferFn only when explicitly invoked, passing arguments", () => {
  let counter = 1
  const deferFn = jest.fn().mockReturnValue(resolveTo())
  const { getByText } = render(
    <Async deferFn={deferFn}>
      {({ run }) => {
        return <button onClick={() => run("go", counter++)}>run</button>
      }}
    </Async>
  )
  expect(deferFn).not.toHaveBeenCalled()
  fireEvent.click(getByText("run"))
  expect(deferFn).toHaveBeenCalledWith("go", 1)
  fireEvent.click(getByText("run"))
  expect(deferFn).toHaveBeenCalledWith("go", 2)
})

test("reload uses the arguments of the previous run", () => {
  let counter = 1
  const deferFn = jest.fn().mockReturnValue(resolveTo())
  const { getByText } = render(
    <Async deferFn={deferFn}>
      {({ run, reload }) => {
        return (
          <div>
            <button onClick={() => run("go", counter++)}>run</button>
            <button onClick={reload}>reload</button>
          </div>
        )
      }}
    </Async>
  )
  expect(deferFn).not.toHaveBeenCalled()
  fireEvent.click(getByText("run"))
  expect(deferFn).toHaveBeenCalledWith("go", 1)
  fireEvent.click(getByText("run"))
  expect(deferFn).toHaveBeenCalledWith("go", 2)
  fireEvent.click(getByText("reload"))
  expect(deferFn).toHaveBeenCalledWith("go", 2)
})

test("only accepts the last invocation of the promise", async () => {
  let i = 0
  const resolves = [resolveIn(10)("a"), resolveIn(20)("b"), resolveIn(10)("c")]
  const { getByText } = render(
    <Async deferFn={i => resolves[i]}>
      {({ data, run }) => {
        if (data) {
          expect(data).toBe("c")
          return "done"
        }
        return <button onClick={() => run(i)}>run</button>
      }}
    </Async>
  )
  fireEvent.click(getByText("run"))
  i++
  fireEvent.click(getByText("run"))
  i++
  fireEvent.click(getByText("run"))
  await waitForElement(() => getByText("done"))
})

test("invokes onResolve callback when promise resolves", async () => {
  const promiseFn = jest.fn().mockReturnValue(Promise.resolve("ok"))
  const onResolve = jest.fn()
  render(<Async promiseFn={promiseFn} onResolve={onResolve} />)
  await Promise.resolve()
  expect(onResolve).toHaveBeenCalledWith("ok")
})

test("invokes onReject callback when promise rejects", async () => {
  const promiseFn = jest.fn().mockReturnValue(Promise.reject("err"))
  const onReject = jest.fn()
  render(<Async promiseFn={promiseFn} onReject={onReject} />)
  await Promise.resolve()
  expect(onReject).toHaveBeenCalledWith("err")
})

test("cancels pending promise when unmounted", async () => {
  const promiseFn = jest.fn().mockReturnValue(Promise.resolve("ok"))
  const onResolve = jest.fn()
  const { unmount } = render(<Async promiseFn={promiseFn} onResolve={onResolve} />)
  unmount()
  await Promise.resolve()
  expect(onResolve).not.toHaveBeenCalled()
})

test("Async.Resolved renders only after the promise is resolved", async () => {
  const promiseFn = () => resolveTo("done")
  const { getByText, queryByText } = render(
    <Async promiseFn={promiseFn}>
      <Async.Resolved>{data => data}</Async.Resolved>
    </Async>
  )
  expect(queryByText("done")).toBeNull()
  await waitForElement(() => getByText("done"))
  expect(queryByText("done")).toBeInTheDocument()
})

test("Async.Loading renders only while the promise is pending", async () => {
  const promiseFn = () => resolveTo("ok")
  const { getByText, queryByText } = render(
    <Async promiseFn={promiseFn}>
      <Async.Loading>loading</Async.Loading>
      <Async.Resolved>done</Async.Resolved>
    </Async>
  )
  expect(queryByText("loading")).toBeInTheDocument()
  await waitForElement(() => getByText("done"))
  expect(queryByText("loading")).toBeNull()
})

test("Async.Rejected renders only after the promise is rejected", async () => {
  const promiseFn = () => rejectTo("err")
  const { getByText, queryByText } = render(
    <Async promiseFn={promiseFn}>
      <Async.Rejected>{err => err}</Async.Rejected>
    </Async>
  )
  expect(queryByText("err")).toBeNull()
  await waitForElement(() => getByText("err"))
  expect(queryByText("err")).toBeInTheDocument()
})
