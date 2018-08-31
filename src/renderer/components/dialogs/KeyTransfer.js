const React = require('react')
const { ipcRenderer } = require('electron')

const {
  Spinner,
  Classes,
  Button,
  ButtonGroup,
  Dialog
} = require('@blueprintjs/core')

class KeyViewPanel extends React.Component {
  render () {
    const { autocryptKey } = this.props
    const tx = window.translate
    return (
      <div>
        <p>{tx('showKeyTransferMessage')}</p>
        <p>{autocryptKey}</p>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <ButtonGroup>
              <Button onClick={this.props.onClose}> Done </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>
    )
  }
}

class KeyLoadingPanel extends React.Component {
  render () {
    return <Spinner size={50} intent='success' />
  }
}

class InitiatePanel extends React.Component {
  render () {
    const tx = window.translate
    return (
      <div>
        <p>{tx('initiateKeyTransfer')}</p>
        <ButtonGroup>
          <Button onClick={this.props.onClick} text={tx('initiateKeyTransferTitle')} />
        </ButtonGroup>
      </div>
    )
  }
}

class KeyTransferDialog extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      loading: false,
      key: false
    }
    this.ready = this.ready.bind(this)
    this.initiateKeyTransfer = this.initiateKeyTransfer.bind(this)
  }

  ready (key) {
    this.setState({ loading: false, key })
  }

  componentDidUpdate () {
    if (this.state.loading) {
      var key = ipcRenderer.sendSync('dispatchSync', 'initiateKeyTransfer')
      this.ready(key)
    }
  }

  initiateKeyTransfer () {
    this.setState({ loading: true })
  }

  render () {
    const { isOpen, onClose } = this.props
    const { loading, key } = this.state
    const tx = window.translate

    let body
    if (loading) body = <KeyLoadingPanel />
    else if (key) body = <KeyViewPanel autocryptKey={key} onClose={onClose} />
    else body = <InitiatePanel onClick={this.initiateKeyTransfer} />
    return (
      <Dialog
        isOpen={isOpen}
        title='Autocrypt Key Transfer'
        icon='exchange'
        onClose={onClose}
        canOutsideClickClose={false}>
        <div className={Classes.DIALOG_BODY}>
          {body}
        </div>
      </Dialog>
    )
  }
}

module.exports = KeyTransferDialog
